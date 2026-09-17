using System.Text.Json;
using LojinhaCorsa.API.Data;
using LojinhaCorsa.API.Domain;
using LojinhaCorsa.API.Infrastructure;

namespace LojinhaCorsa.API.Services;

public interface IAuditService
{
    void Add(string entity, object entityId, string action, string? previousStatus = null,
        string? newStatus = null, object? details = null);
}

public sealed class AuditService(AppDbContext db, ICurrentUser currentUser, IHttpContextAccessor http) : IAuditService
{
    public void Add(string entity, object entityId, string action, string? previousStatus = null,
        string? newStatus = null, object? details = null)
    {
        db.AuditLogs.Add(new AuditLog
        {
            UserId = currentUser.UserId,
            OccurredAt = DateTimeOffset.UtcNow,
            EntityType = entity,
            EntityId = entityId.ToString()!,
            Action = action,
            PreviousStatus = previousStatus,
            NewStatus = newStatus,
            Details = JsonDocument.Parse(JsonSerializer.Serialize(details ?? new { })),
            IpAddress = http.HttpContext?.Connection.RemoteIpAddress,
            CorrelationId = Guid.TryParse(http.HttpContext?.TraceIdentifier, out var correlation) ? correlation : null
        });
    }
}
