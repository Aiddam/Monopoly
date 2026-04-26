using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace UkraineMonopoly.Server.Rooms;

public sealed class RoomManager
{
    private const int MaxPlayers = 6;
    private static readonly char[] CodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray();
    private readonly ConcurrentDictionary<string, Room> _rooms = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, string> _connectionRooms = new();
    private readonly object _gate = new();

    public RoomSnapshot CreateRoom(string connectionId, string playerName, bool testMode = false)
    {
        lock (_gate)
        {
            LeaveRoom(connectionId);
            var code = CreateUniqueCode();
            var host = new RoomPlayer(connectionId, CleanName(playerName), true, true, DateTimeOffset.UtcNow);
            var room = new Room(code, host, testMode);
            _rooms[code] = room;
            _connectionRooms[connectionId] = code;
            return room.Snapshot();
        }
    }

    public RoomSnapshot JoinRoom(string connectionId, string code, string playerName)
    {
        lock (_gate)
        {
            if (!_rooms.TryGetValue(code, out var room) || room.Closed)
            {
                throw new InvalidOperationException("Кімнату не знайдено.");
            }

            if (room.Players.Count >= MaxPlayers)
            {
                throw new InvalidOperationException($"У кімнаті вже {MaxPlayers} гравців.");
            }

            LeaveRoom(connectionId);
            room.Players.Add(new RoomPlayer(connectionId, CleanName(playerName), false, false, DateTimeOffset.UtcNow));
            _connectionRooms[connectionId] = room.Code;
            return room.Snapshot();
        }
    }

    public RoomSnapshot SetReady(string connectionId, string code, bool ready)
    {
        lock (_gate)
        {
            var room = GetRoom(code);
            var playerIndex = room.Players.FindIndex(player => player.Id == connectionId);
            if (playerIndex < 0)
            {
                throw new InvalidOperationException("Гравець не в цій кімнаті.");
            }

            var player = room.Players[playerIndex];
            room.Players[playerIndex] = player with { Ready = player.IsHost || ready };
            return room.Snapshot();
        }
    }

    public RoomSnapshot? LeaveRoom(string connectionId)
    {
        lock (_gate)
        {
            if (!_connectionRooms.TryRemove(connectionId, out var code))
            {
                return null;
            }

            if (!_rooms.TryGetValue(code, out var room))
            {
                return null;
            }

            var wasHost = room.Players.Any(player => player.Id == connectionId && player.IsHost);
            room.Players.RemoveAll(player => player.Id == connectionId);

            if (room.Players.Count == 0)
            {
                _rooms.TryRemove(code, out _);
                return null;
            }

            if (wasHost)
            {
                var nextHost = room.Players.OrderBy(player => player.JoinedAt).First();
                var nextHostIndex = room.Players.FindIndex(player => player.Id == nextHost.Id);
                room.Players[nextHostIndex] = nextHost with { IsHost = true, Ready = true };
            }

            return room.Snapshot();
        }
    }

    public RoomSnapshot CloseRoom(string connectionId, string code)
    {
        lock (_gate)
        {
            var room = GetRoom(code);
            var player = room.Players.FirstOrDefault(candidate => candidate.Id == connectionId);
            if (player is not { IsHost: true })
            {
                throw new InvalidOperationException("Закрити кімнату може тільки хост.");
            }

            room.Closed = true;
            _rooms.TryRemove(code, out _);
            foreach (var roomPlayer in room.Players)
            {
                _connectionRooms.TryRemove(roomPlayer.Id, out _);
            }
            return room.Snapshot();
        }
    }

    public RoomSnapshot GetSnapshot(string code)
    {
        lock (_gate)
        {
            return GetRoom(code).Snapshot();
        }
    }

    public string? GetRoomCodeForConnection(string connectionId) =>
        _connectionRooms.TryGetValue(connectionId, out var code) ? code : null;

    public bool ContainsPeer(string code, string peerId)
    {
        lock (_gate)
        {
            return _rooms.TryGetValue(code, out var room) && room.Players.Any(player => player.Id == peerId);
        }
    }

    private Room GetRoom(string code)
    {
        if (!_rooms.TryGetValue(code, out var room) || room.Closed)
        {
            throw new InvalidOperationException("Кімнату не знайдено.");
        }
        return room;
    }

    private string CreateUniqueCode()
    {
        for (var attempt = 0; attempt < 50; attempt++)
        {
            Span<char> buffer = stackalloc char[5];
            for (var index = 0; index < buffer.Length; index++)
            {
                buffer[index] = CodeAlphabet[RandomNumberGenerator.GetInt32(CodeAlphabet.Length)];
            }
            var code = new string(buffer);
            if (!_rooms.ContainsKey(code))
            {
                return code;
            }
        }

        throw new InvalidOperationException("Не вдалося створити код кімнати.");
    }

    private static string CleanName(string name)
    {
        var trimmed = string.IsNullOrWhiteSpace(name) ? "Гравець" : name.Trim();
        return trimmed.Length > 18 ? trimmed[..18] : trimmed;
    }
}
