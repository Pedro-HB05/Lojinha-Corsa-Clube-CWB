FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY LojinhaCorsa.API.csproj ./
RUN dotnet restore LojinhaCorsa.API.csproj
COPY . .
RUN dotnet publish LojinhaCorsa.API.csproj \
    --configuration Release \
    --output /app/publish \
    --no-restore \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
RUN mkdir -p /app/uploads && chmod -R 777 /app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "LojinhaCorsa.API.dll"]
