using LojinhaCorsa.API.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LojinhaCorsa.API.Controllers;

[ApiController, Route("api/health")]
public sealed class HealthController(AppDbContext db, IWebHostEnvironment environment) : ControllerBase
{
    [AllowAnonymous, HttpGet]
    public IActionResult Get() => Ok(new { status = "healthy", timestamp = DateTimeOffset.UtcNow });

    [AllowAnonymous, HttpGet("database")]
    public async Task<IActionResult> Database(CancellationToken ct)
    {
        try
        {
            await db.Database.OpenConnectionAsync(ct);
            await db.Database.CloseConnectionAsync();
            return Ok(new { status = "healthy", database = "connected" });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new
            {
                status = "unhealthy",
                database = "unavailable",
                errorType = environment.IsDevelopment() ? ex.GetType().Name : null
            });
        }
    }
}
