using Microsoft.AspNetCore.SignalR;

namespace UkraineMonopoly.Server.Rooms;

public sealed class RoomHub(RoomManager rooms) : Hub
{
    public async Task<RoomSnapshot> CreateRoom(string playerName, bool testMode = false, string? playerId = null)
    {
        try
        {
            var snapshot = rooms.CreateRoom(Context.ConnectionId, playerName, testMode, playerId);
            await Groups.AddToGroupAsync(Context.ConnectionId, snapshot.Code);
            await Clients.Caller.SendAsync("RoomSnapshot", snapshot);
            return snapshot;
        }
        catch (InvalidOperationException exception)
        {
            throw new HubException(exception.Message);
        }
    }

    public async Task<RoomSnapshot> RestoreRoom(RoomRestoreRequest previousRoom, string playerName, string playerId)
    {
        try
        {
            var snapshot = rooms.RestoreRoom(Context.ConnectionId, previousRoom, playerName, playerId);
            await Groups.AddToGroupAsync(Context.ConnectionId, snapshot.Code);
            await Clients.Caller.SendAsync("RoomSnapshot", snapshot);
            return snapshot;
        }
        catch (InvalidOperationException exception)
        {
            throw new HubException(exception.Message);
        }
    }

    public async Task<RoomSnapshot> JoinRoom(string code, string playerName, string? playerId = null)
    {
        try
        {
            return await JoinRoomCore(code, playerName, playerId);
        }
        catch (InvalidOperationException exception)
        {
            throw new HubException(exception.Message);
        }
    }

    public async Task<RoomJoinResult> TryJoinRoom(string code, string playerName, string? playerId = null)
    {
        try
        {
            var snapshot = await JoinRoomCore(code, playerName, playerId);
            return new RoomJoinResult(snapshot, null);
        }
        catch (InvalidOperationException exception)
        {
            return new RoomJoinResult(null, exception.Message);
        }
    }

    public async Task SetReady(string code, bool ready)
    {
        try
        {
            var snapshot = rooms.SetReady(Context.ConnectionId, code, ready);
            await Clients.Group(snapshot.Code).SendAsync("RoomSnapshot", snapshot);
        }
        catch (InvalidOperationException exception)
        {
            throw new HubException(exception.Message);
        }
    }

    public async Task RelaySignal(string code, string toPeerId, string kind, object? payload)
    {
        var normalizedCode = CleanCode(code);
        var fromPeerId = rooms.GetPeerIdForConnection(Context.ConnectionId);
        var toConnectionId = rooms.GetConnectionIdForPeer(normalizedCode, toPeerId);
        if (fromPeerId is null || !rooms.ContainsPeer(normalizedCode, fromPeerId))
        {
            await Clients.Caller.SendAsync("ErrorMessage", "SignalR relay відхилено: ви не в кімнаті.");
            return;
        }

        if (toConnectionId is null || !rooms.ContainsPeer(normalizedCode, toPeerId))
        {
            await Clients.Caller.SendAsync("PeerLeft", toPeerId);
            return;
        }

        var signal = new SignalEnvelope(fromPeerId, toPeerId, kind, payload);
        await Clients.Client(toConnectionId).SendAsync("SignalReceived", signal);
    }

    public async Task BroadcastGameMessage(string code, object? payload)
    {
        var normalizedCode = CleanCode(code);
        var fromPeerId = rooms.GetPeerIdForConnection(Context.ConnectionId);
        if (fromPeerId is null || !rooms.ContainsPeer(normalizedCode, fromPeerId))
        {
            await Clients.Caller.SendAsync("ErrorMessage", "Синхронізацію гри відхилено: гравець не в кімнаті.");
            return;
        }

        await Clients.OthersInGroup(normalizedCode).SendAsync("GameMessage", fromPeerId, payload);
    }

    public async Task LeaveRoom(string code)
    {
        await LeaveCurrentRoom(code);
    }

    public async Task CloseRoom(string code)
    {
        try
        {
            var snapshot = rooms.CloseRoom(Context.ConnectionId, code);
            await Clients.Group(snapshot.Code).SendAsync("RoomClosed");
        }
        catch (InvalidOperationException exception)
        {
            throw new HubException(exception.Message);
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var disconnected = rooms.Disconnect(Context.ConnectionId);
        if (disconnected is not null)
        {
            await Clients.Group(disconnected.Code).SendAsync("PeerLeft", disconnected.PlayerId);
            await Clients.Group(disconnected.Code).SendAsync("RoomSnapshot", disconnected.Snapshot);
        }
        await base.OnDisconnectedAsync(exception);
    }

    private async Task LeaveCurrentRoom(string code)
    {
        var normalizedCode = CleanCode(code);
        var peerId = rooms.GetPeerIdForConnection(Context.ConnectionId) ?? Context.ConnectionId;
        var snapshot = rooms.LeaveRoom(Context.ConnectionId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, normalizedCode);
        if (snapshot is null)
        {
            return;
        }

        await Clients.Group(snapshot.Code).SendAsync("PeerLeft", peerId);
        await Clients.Group(snapshot.Code).SendAsync("RoomSnapshot", snapshot);
        var host = snapshot.Players.FirstOrDefault(player => player.IsHost);
        if (host is not null)
        {
            await Clients.Group(snapshot.Code).SendAsync("HostChanged", host.Id);
        }
    }

    private async Task<RoomSnapshot> JoinRoomCore(string code, string playerName, string? playerId)
    {
        var snapshot = rooms.JoinRoom(Context.ConnectionId, code, playerName, playerId);
        await Groups.AddToGroupAsync(Context.ConnectionId, snapshot.Code);
        var joinedPeerId = rooms.GetPeerIdForConnection(Context.ConnectionId);
        var joined = snapshot.Players.FirstOrDefault(player => player.Id == joinedPeerId);
        if (joined is null)
        {
            throw new InvalidOperationException("Не вдалося приєднати гравця до кімнати.");
        }

        await Clients.OthersInGroup(snapshot.Code).SendAsync("PeerJoined", joined);
        await Clients.Group(snapshot.Code).SendAsync("RoomSnapshot", snapshot);
        return snapshot;
    }

    private static string CleanCode(string code) => (code ?? string.Empty).Trim().ToUpperInvariant();
}
