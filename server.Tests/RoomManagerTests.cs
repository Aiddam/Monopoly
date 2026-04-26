using UkraineMonopoly.Server.Rooms;

namespace UkraineMonopoly.Server.Tests;

public sealed class RoomManagerTests
{
    [Fact]
    public void CreateRoomCreatesHostAndCode()
    {
        var manager = new RoomManager();

        var room = manager.CreateRoom("host-1", "Олена");

        Assert.Equal(5, room.Code.Length);
        Assert.Single(room.Players);
        Assert.True(room.Players[0].IsHost);
        Assert.True(room.Players[0].Ready);
    }

    [Fact]
    public void JoinRoomAllowsUpToSixPlayers()
    {
        var manager = new RoomManager();
        var room = manager.CreateRoom("host", "Host");

        manager.JoinRoom("p2", room.Code, "Two");
        manager.JoinRoom("p3", room.Code, "Three");
        manager.JoinRoom("p4", room.Code, "Four");
        manager.JoinRoom("p5", room.Code, "Five");
        var full = manager.JoinRoom("p6", room.Code, "Six");

        Assert.Equal(6, full.Players.Count);
        Assert.Throws<InvalidOperationException>(() => manager.JoinRoom("p7", room.Code, "Seven"));
    }

    [Fact]
    public void LeaveRoomPromotesOldestPeerToHost()
    {
        var manager = new RoomManager();
        var room = manager.CreateRoom("host", "Host");
        manager.JoinRoom("p2", room.Code, "Two");
        manager.JoinRoom("p3", room.Code, "Three");

        var afterLeave = manager.LeaveRoom("host");

        Assert.NotNull(afterLeave);
        Assert.Equal("p2", afterLeave!.Players.Single(player => player.IsHost).Id);
    }

    [Fact]
    public void RelayGuardChecksPeerMembership()
    {
        var manager = new RoomManager();
        var room = manager.CreateRoom("host", "Host");
        manager.JoinRoom("p2", room.Code, "Two");

        Assert.True(manager.ContainsPeer(room.Code, "host"));
        Assert.True(manager.ContainsPeer(room.Code, "p2"));
        Assert.False(manager.ContainsPeer(room.Code, "missing"));
    }

    [Fact]
    public void DisconnectKeepsStablePlayerForReconnect()
    {
        var manager = new RoomManager();
        var room = manager.CreateRoom("conn-host", "Host", playerId: "host-id");

        var disconnected = manager.Disconnect("conn-host");

        Assert.NotNull(disconnected);
        Assert.Equal("host-id", disconnected!.PlayerId);
        Assert.False(manager.ContainsPeer(room.Code, "host-id"));

        var reconnected = manager.JoinRoom("conn-host-2", room.Code, "Host", "host-id");

        Assert.Single(reconnected.Players);
        Assert.Equal("host-id", reconnected.Players[0].Id);
        Assert.True(reconnected.Players[0].IsHost);
        Assert.True(manager.ContainsPeer(room.Code, "host-id"));
        Assert.Equal("conn-host-2", manager.GetConnectionIdForPeer(room.Code, "host-id"));
    }

    [Fact]
    public void HostCanRestoreRoomAfterServerMemoryReset()
    {
        var originalManager = new RoomManager();
        var originalRoom = originalManager.CreateRoom("host-conn", "Host", playerId: "host-id");
        originalManager.JoinRoom("p2-conn", originalRoom.Code, "Two", "p2-id");
        originalManager.JoinRoom("p3-conn", originalRoom.Code, "Three", "p3-id");
        var snapshot = originalManager.GetSnapshot(originalRoom.Code);

        var restoredManager = new RoomManager();
        var restored = restoredManager.RestoreRoom("host-new", snapshot, "Host", "host-id");

        Assert.Equal(originalRoom.Code, restored.Code);
        Assert.Equal(3, restored.Players.Count);
        Assert.True(restoredManager.ContainsPeer(originalRoom.Code, "host-id"));
        Assert.False(restoredManager.ContainsPeer(originalRoom.Code, "p2-id"));

        var rejoined = restoredManager.JoinRoom("p2-new", originalRoom.Code, "Two", "p2-id");

        Assert.Equal(3, rejoined.Players.Count);
        Assert.True(restoredManager.ContainsPeer(originalRoom.Code, "p2-id"));
    }

    [Fact]
    public void NonHostCannotRestoreRoomAfterServerMemoryReset()
    {
        var originalManager = new RoomManager();
        var originalRoom = originalManager.CreateRoom("host-conn", "Host", playerId: "host-id");
        originalManager.JoinRoom("p2-conn", originalRoom.Code, "Two", "p2-id");
        var snapshot = originalManager.GetSnapshot(originalRoom.Code);

        var restoredManager = new RoomManager();

        Assert.Throws<InvalidOperationException>(() => restoredManager.RestoreRoom("p2-new", snapshot, "Two", "p2-id"));
    }
}
