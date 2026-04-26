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

    public RoomSnapshot CreateRoom(string connectionId, string playerName, bool testMode = false, string? playerId = null)
    {
        lock (_gate)
        {
            LeaveRoom(connectionId);
            var stablePlayerId = CleanPlayerId(playerId, connectionId);
            var code = CreateUniqueCode();
            var host = new RoomPlayer(stablePlayerId, CleanName(playerName), true, true, DateTimeOffset.UtcNow, connectionId);
            var room = new Room(code, host, testMode);
            _rooms[code] = room;
            _connectionRooms[connectionId] = code;
            return room.Snapshot();
        }
    }

    public RoomSnapshot JoinRoom(string connectionId, string code, string playerName, string? playerId = null)
    {
        lock (_gate)
        {
            if (!_rooms.TryGetValue(code, out var room) || room.Closed)
            {
                throw new InvalidOperationException("Кімнату не знайдено.");
            }

            LeaveRoom(connectionId);
            var stablePlayerId = CleanPlayerId(playerId, connectionId);
            var existingIndex = room.Players.FindIndex(player => player.Id == stablePlayerId);
            if (existingIndex >= 0)
            {
                var existing = room.Players[existingIndex];
                if (!string.IsNullOrWhiteSpace(existing.ConnectionId))
                {
                    _connectionRooms.TryRemove(existing.ConnectionId, out _);
                }
                room.Players[existingIndex] = existing with { Name = CleanName(playerName), ConnectionId = connectionId };
                _connectionRooms[connectionId] = room.Code;
                return room.Snapshot();
            }

            if (room.Players.Count >= MaxPlayers)
            {
                throw new InvalidOperationException($"У кімнаті вже {MaxPlayers} гравців.");
            }

            room.Players.Add(new RoomPlayer(stablePlayerId, CleanName(playerName), false, false, DateTimeOffset.UtcNow, connectionId));
            _connectionRooms[connectionId] = room.Code;
            return room.Snapshot();
        }
    }

    public RoomSnapshot SetReady(string connectionId, string code, bool ready)
    {
        lock (_gate)
        {
            var room = GetRoom(code);
            var playerIndex = room.Players.FindIndex(player => player.ConnectionId == connectionId);
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

            var removed = room.Players.FirstOrDefault(player => player.ConnectionId == connectionId);
            var wasHost = removed?.IsHost == true;
            room.Players.RemoveAll(player => player.ConnectionId == connectionId);

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
            var player = room.Players.FirstOrDefault(candidate => candidate.ConnectionId == connectionId);
            if (player is not { IsHost: true })
            {
                throw new InvalidOperationException("Закрити кімнату може тільки хост.");
            }

            room.Closed = true;
            _rooms.TryRemove(code, out _);
            foreach (var roomPlayer in room.Players)
            {
                if (!string.IsNullOrWhiteSpace(roomPlayer.ConnectionId))
                {
                    _connectionRooms.TryRemove(roomPlayer.ConnectionId, out _);
                }
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

    public string? GetPeerIdForConnection(string connectionId)
    {
        lock (_gate)
        {
            if (!_connectionRooms.TryGetValue(connectionId, out var code) || !_rooms.TryGetValue(code, out var room))
            {
                return null;
            }

            return room.Players.FirstOrDefault(player => player.ConnectionId == connectionId)?.Id;
        }
    }

    public string? GetConnectionIdForPeer(string code, string peerId)
    {
        lock (_gate)
        {
            if (!_rooms.TryGetValue(code, out var room))
            {
                return null;
            }

            return room.Players.FirstOrDefault(player => player.Id == peerId)?.ConnectionId;
        }
    }

    public DisconnectedPlayer? Disconnect(string connectionId)
    {
        lock (_gate)
        {
            if (!_connectionRooms.TryRemove(connectionId, out var code) || !_rooms.TryGetValue(code, out var room))
            {
                return null;
            }

            var playerIndex = room.Players.FindIndex(player => player.ConnectionId == connectionId);
            if (playerIndex < 0)
            {
                return null;
            }

            var player = room.Players[playerIndex];
            room.Players[playerIndex] = player with { ConnectionId = null };
            return new DisconnectedPlayer(code, player.Id, room.Snapshot());
        }
    }

    public bool ContainsPeer(string code, string peerId)
    {
        lock (_gate)
        {
            return _rooms.TryGetValue(code, out var room) &&
                room.Players.Any(player => player.Id == peerId && !string.IsNullOrWhiteSpace(player.ConnectionId));
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

    private static string CleanPlayerId(string? playerId, string fallback)
    {
        var trimmed = string.IsNullOrWhiteSpace(playerId) ? fallback : playerId.Trim();
        return trimmed.Length > 64 ? trimmed[..64] : trimmed;
    }
}

public sealed record DisconnectedPlayer(string Code, string PlayerId, RoomSnapshot Snapshot);
