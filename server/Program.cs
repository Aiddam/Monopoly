using UkraineMonopoly.Server.Rooms;

var builder = WebApplication.CreateBuilder(args);
var clientOrigins = (builder.Configuration["ClientOrigins"] ?? string.Empty)
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    .Select(origin => origin.TrimEnd('/'))
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();

if (clientOrigins.Length == 0)
{
    clientOrigins =
    [
        "http://localhost:5173",
        "https://localhost:5173",
        "http://localhost:5174",
        "https://localhost:5174",
        "http://127.0.0.1:5173",
        "https://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "https://127.0.0.1:5174"
    ];
}

builder.Services.AddCors(options =>
{
    options.AddPolicy("client", policy =>
    {
        policy
            .WithOrigins(clientOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});
builder.Services.AddSignalR();
builder.Services.AddSingleton<RoomManager>();

var app = builder.Build();

app.UseCors("client");

app.MapGet("/", () => Results.Ok(new { name = "Ukraine Monopoly SignalR", status = "ok" }));
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapHub<RoomHub>("/hubs/rooms");

app.Run();

public partial class Program;
