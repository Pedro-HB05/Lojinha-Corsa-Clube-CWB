using System.ComponentModel.DataAnnotations;

namespace LojinhaCorsa.API.Contracts;

public sealed record RegisterRequest(
    [Required, EmailAddress, MaxLength(255)] string Email,
    [Required, MinLength(8), MaxLength(100)] string Password,
    [Required, MaxLength(180)] string FullName,
    [MaxLength(30)] string? Phone,
    [MaxLength(50)] string? MembershipNumber);

public sealed record LoginRequest(
    [Required, EmailAddress] string Email,
    [Required] string Password);

public sealed record BootstrapAdminRequest(
    [Required] string BootstrapToken,
    [Required, EmailAddress] string Email,
    [Required, MinLength(12)] string Password,
    [Required, MaxLength(180)] string FullName);

public sealed record AuthResponse(string AccessToken, DateTimeOffset ExpiresAt,
    Guid UserId, Guid? MemberId, string FullName, string Email, IReadOnlyList<string> Roles);
