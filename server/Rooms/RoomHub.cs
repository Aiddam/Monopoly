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

    public async Task<RoomSnapshot> JoinRoom(string code, string playerName, string? playerId = null)
    {
        try
        {
            var snapshot = rooms.JoinRoom(Context.ConnectionId, code, playerName, playerId);
            await Groups.AddToGroupAsync(Context.ConnectionId, snapshot.Code);
            var joinedPeerId = rooms.GetPeerIdForConnection(Context.ConnectionId);
            var joined = snapshot.Players.FirstOrDefault(player => player.Id == joinedPeerId);
            if (joined is null)
            {
                throw new HubException("Не вдалося приєднати гравця до кімнати.");
            }
            await Clients.OthersInGroup(snapshot.Code).SendAsync("PeerJoined", joined);
            await Clients.Group(snapshot.Code).SendAsync("RoomSnapshot", snapshot);
            return snapshot;
        }
        catch (InvalidOperationException exception)
        {
            throw new HubException(exception.Message);
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
        var fromPeerId = rooms.GetPeerIdForConnection(Context.ConnectionId);
        var toConnectionId = rooms.GetConnectionIdForPeer(code, toPeerId);
        if (fromPeerId is null || toConnectionId is null || !rooms.ContainsPeer(code, fromPeerId) || !rooms.ContainsPeer(code, toPeerId))
        {
            await Clients.Caller.SendAsync("ErrorMessage", "SignalR relay відхилено: peer не в кімнаті.");
            return;
        }

        var signal = new SignalEnvelope(fromPeerId, toPeerId, kind, payload);
        await Clients.Client(toConnectionId).SendAsync("SignalReceived", signal);
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
        var peerId = rooms.GetPeerIdForConnection(Context.ConnectionId) ?? Context.ConnectionId;
        var snapshot = rooms.LeaveRoom(Context.ConnectionId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, code);
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
}
