using LojinhaCorsa.API.Contracts;
using LojinhaCorsa.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LojinhaCorsa.API.Controllers;

[ApiController, Route("api/auth"), Route("auth")]
public sealed class AuthController(IAuthService service) : ControllerBase
{
    [HttpPost("register")]
    public Task<AuthResponse> Register(RegisterRequest request, CancellationToken ct) => service.RegisterAsync(request, ct);

    [HttpPost("login")]
    public Task<AuthResponse> Login(LoginRequest request, CancellationToken ct) => service.LoginAsync(request, ct);

    [HttpPost("bootstrap-admin")]
    public Task<AuthResponse> BootstrapAdmin(BootstrapAdminRequest request, CancellationToken ct) =>
        service.BootstrapAdminAsync(request, ct);

    [Authorize, HttpGet("me")]
    public IActionResult Me() => Ok(new
    {
        userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value,
        memberId = User.FindFirst("member_id")?.Value,
        name = User.Identity?.Name,
        email = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value,
        roles = User.FindAll(System.Security.Claims.ClaimTypes.Role).Select(x => x.Value)
    });
}
