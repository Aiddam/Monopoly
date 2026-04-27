# Deployment Guide

This project has two deployable parts:

- `client/`: Vite React static site.
- `server/`: ASP.NET Core SignalR room server used for online rooms and peer signaling.

The game will open as a static site without the server, but online rooms need the SignalR server.

## Recommended Hosting

Use Render for both parts:

- Render Static Site for `client/`.
- Render Web Service with Docker for `server/`.

This keeps the setup in one dashboard and supports WebSockets for SignalR.

## 1. Deploy the Server

Create a Render Web Service from this repository.

Settings:

- Runtime: Docker
- Dockerfile path: `server.Dockerfile`
- Health check path: `/health`

Environment variables:

```text
ASPNETCORE_ENVIRONMENT=Production
DOTNET_HOSTBUILDER__RELOADCONFIGONCHANGE=false
DOTNET_USE_POLLING_FILE_WATCHER=true
ClientOrigins=https://your-client-domain.onrender.com
SignalR__MaximumReceiveMessageSizeBytes=1048576
```

After deploy, copy the server URL, for example:

```text
https://your-monopoly-server.onrender.com
```

## 2. Deploy the Client

Create a Render Static Site from the same repository.

Settings:

- Root directory: `client`
- Build command: `npm ci && npm run build`
- Publish directory: `dist`

Environment variables:

```text
VITE_SIGNALR_URL=https://your-monopoly-server.onrender.com
```

After the first client deploy finishes, copy the client URL and update the server's `ClientOrigins` value to that exact origin. Redeploy the server after changing it.

## 3. Local Production Check

From the repository root:

```powershell
dotnet test
cd client
npm run test
npm run build
```

To test the published server image locally:

```powershell
docker build -f server.Dockerfile -t monopoly-server .
docker run --rm -p 5109:8080 -e ClientOrigins=http://localhost:5173,http://localhost:5174 monopoly-server
```

Then in `client/.env.local`:

```text
VITE_SIGNALR_URL=http://localhost:5109
```

## Notes

- `VITE_SIGNALR_URL` is baked into the client during build. If the server URL changes, redeploy the client.
- `ClientOrigins` must match the browser URL exactly, including `https://`.
- Free web services can sleep after inactivity. For online play, use a paid always-on server instance.
- The current multiplayer model uses SignalR for room signaling and WebRTC data channels for game state. Some strict networks can block peer-to-peer WebRTC; a TURN server would be needed for the most reliable public multiplayer.
