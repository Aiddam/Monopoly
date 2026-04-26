FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY server/UkraineMonopoly.Server.csproj server/
RUN dotnet restore server/UkraineMonopoly.Server.csproj

COPY server/ server/
RUN dotnet publish server/UkraineMonopoly.Server.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_ENVIRONMENT=Production
ENV PORT=8080
EXPOSE 8080

COPY --from=build /app/publish .

ENTRYPOINT ["sh", "-c", "ASPNETCORE_URLS=http://0.0.0.0:${PORT} dotnet UkraineMonopoly.Server.dll"]
