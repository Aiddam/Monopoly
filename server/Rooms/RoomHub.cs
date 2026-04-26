using Microsoft.AspNetCore.SignalR;

namespace UkraineMonopoly.Server.Rooms;

public sealed class RoomHub(RoomManager rooms) : Hub
{
    public async Task<RoomSnapshot> CreateRoom(string playerName, bool testMode = false)
    {
        var snapshot = rooms.CreateRoom(Context.ConnectionId, playerName, testMode);
        await Groups.AddToGroupAsync(Context.ConnectionId, snapshot.Code);
        await Clients.Caller.SendAsync("RoomSnapshot", snapshot);
        return snapshot;
    }

    public async Task<RoomSnapshot> JoinRoom(string code, string playerName)
    {
        var snapshot = rooms.JoinRoom(Context.ConnectionId, code, playerName);
        await Groups.AddToGroupAsync(Context.ConnectionId, snapshot.Code);
        var joined = snapshot.Players.First(player => player.Id == Context.ConnectionId);
        await Clients.OthersInGroup(snapshot.Code).SendAsync("PeerJoined", joined);
        await Clients.Group(snapshot.Code).SendAsync("RoomSnapshot", snapshot);
        return snapshot;
    }

    public async Task SetReady(string code, bool ready)
    {
        var snapshot = rooms.SetReady(Context.ConnectionId, code, ready);
        await Clients.Group(snapshot.Code).SendAsync("RoomSnapshot", snapshot);
    }

    public async Task RelaySignal(string code, string toPeerId, string kind, object? payload)
    {
        if (!rooms.ContainsPeer(code, Context.ConnectionId) || !rooms.ContainsPeer(code, toPeerId))
        {
            await Clients.Caller.SendAsync("ErrorMessage", "SignalR relay відхилено: peer не в кімнаті.");
            return;
        }

        var signal = new SignalEnvelope(Context.ConnectionId, toPeerId, kind, payload);
        await Clients.Client(toPeerId).SendAsync("SignalReceived", signal);
    }

    public async Task LeaveRoom(string code)
    {
        await LeaveCurrentRoom(code);
    }

    public async Task CloseRoom(string code)
    {
        var snapshot = rooms.CloseRoom(Context.ConnectionId, code);
        await Clients.Group(snapshot.Code).SendAsync("RoomClosed");
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var code = rooms.GetRoomCodeForConnection(Context.ConnectionId);
        if (code is not null)
        {
            await LeaveCurrentRoom(code);
        }
        await base.OnDisconnectedAsync(exception);
    }

    private async Task LeaveCurrentRoom(string code)
    {
        var snapshot = rooms.LeaveRoom(Context.ConnectionId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, code);
        if (snapshot is null)
        {
            return;
        }

        await Clients.Group(snapshot.Code).SendAsync("PeerLeft", Context.ConnectionId);
        await Clients.Group(snapshot.Code).SendAsync("RoomSnapshot", snapshot);
        var host = snapshot.Players.FirstOrDefault(player => player.IsHost);
        if (host is not null)
        {
            await Clients.Group(snapshot.Code).SendAsync("HostChanged", host.Id);
        }
    }
}
