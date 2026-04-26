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
}
