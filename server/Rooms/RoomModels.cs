using System.Text.Json.Serialization;

namespace UkraineMonopoly.Server.Rooms;

public sealed record RoomPlayer(
    string Id,
    string Name,
    bool IsHost,
    bool Ready,
    DateTimeOffset JoinedAt,
    [property: JsonIgnore] string? ConnectionId = null)
{
    public bool Online => !string.IsNullOrWhiteSpace(ConnectionId);
}

public sealed record RoomSnapshot(
    string Code,
    IReadOnlyList<RoomPlayer> Players,
    bool TestMode);

public sealed record RoomJoinResult(
    RoomSnapshot? Room,
    string? Error);

public sealed record RoomRestorePlayer(
    string Id,
    string Name,
    bool IsHost,
    bool Ready,
    DateTimeOffset JoinedAt);

public sealed record RoomRestoreRequest(
    string Code,
    IReadOnlyList<RoomRestorePlayer> Players,
    bool TestMode);

public sealed record SignalEnvelope(
    string FromPeerId,
    string ToPeerId,
    string Kind,
    object? Payload);

internal sealed class Room
{
    public Room(string code, RoomPlayer host, bool testMode)
    {
        Code = code;
        TestMode = testMode;
        Players.Add(host);
    }

    public string Code { get; }
    public List<RoomPlayer> Players { get; } = [];
    public bool TestMode { get; }
    public bool Closed { get; set; }

    public RoomSnapshot Snapshot() => new(Code, Players.OrderBy(player => player.JoinedAt).ToList(), TestMode);
}
