using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using LojinhaCorsa.API.Contracts;
using LojinhaCorsa.API.Data;
using LojinhaCorsa.API.Domain;
using LojinhaCorsa.API.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace LojinhaCorsa.API.Services;

public interface IAuthService
{
    Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken ct);
    Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken ct);
    Task<AuthResponse> BootstrapAdminAsync(BootstrapAdminRequest request, CancellationToken ct);
}

public sealed class AuthService(AppDbContext db, IConfiguration configuration) : IAuthService
{
    public async Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken ct)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(x => x.Email == email, ct))
            throw new AppException(409, "Já existe um usuário com este e-mail.");

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var now = DateTimeOffset.UtcNow;
        var user = new User
        {
            Id = Guid.NewGuid(), Email = email, PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            FullName = request.FullName.Trim(), StatusCode = "active", CreatedAt = now, UpdatedAt = now
        };
        var role = await db.Roles.SingleAsync(x => x.Code == Roles.Member, ct);
        var member = new Member
        {
            Id = Guid.NewGuid(), UserId = user.Id, Phone = request.Phone?.Trim(),
            MembershipNumber = request.MembershipNumber?.Trim(), CreatedAt = now, UpdatedAt = now
        };
        db.AddRange(user, member, new UserRole
        {
            UserId = user.Id, RoleId = role.Id, GrantedAt = now
        });
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return CreateToken(user, member.Id, [Roles.Member]);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken ct)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.Include(x => x.Member).Include(x => x.UserRoles).ThenInclude(x => x.Role)
            .SingleOrDefaultAsync(x => x.Email == email, ct);
        if (user is null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            throw new AppException(401, "E-mail ou senha inválidos.");
        if (user.StatusCode != "active") throw new AppException(403, "Usuário inativo ou bloqueado.");
        user.LastLoginAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return CreateToken(user, user.Member?.Id, user.UserRoles.Select(x => x.Role.Code).ToArray());
    }

    public async Task<AuthResponse> BootstrapAdminAsync(BootstrapAdminRequest request, CancellationToken ct)
    {
        var configuredToken = configuration["Setup:BootstrapToken"];
        if (string.IsNullOrWhiteSpace(configuredToken) ||
            !System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(configuredToken),
                Encoding.UTF8.GetBytes(request.BootstrapToken)))
            throw new AppException(403, "Bootstrap administrativo desabilitado ou token inválido.");
        if (await db.UserRoles.AnyAsync(x => x.Role.Code == Roles.Administrator, ct))
            throw new AppException(409, "Já existe um administrador; o bootstrap foi encerrado.");

        var email = request.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(x => x.Email == email, ct)) throw new AppException(409, "E-mail já cadastrado.");
        var now = DateTimeOffset.UtcNow;
        var role = await db.Roles.SingleAsync(x => x.Code == Roles.Administrator, ct);
        var user = new User
        {
            Id = Guid.NewGuid(), Email = email, FullName = request.FullName.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password), StatusCode = "active",
            CreatedAt = now, UpdatedAt = now
        };
        db.Add(user);
        db.Add(new UserRole { UserId = user.Id, RoleId = role.Id, GrantedAt = now });
        await db.SaveChangesAsync(ct);
        return CreateToken(user, null, [Roles.Administrator]);
    }

    private AuthResponse CreateToken(User user, Guid? memberId, IReadOnlyList<string> roles)
    {
        var expires = DateTimeOffset.UtcNow.AddMinutes(configuration.GetValue("Jwt:ExpirationMinutes", 480));
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()), new(ClaimTypes.Name, user.FullName),
            new(ClaimTypes.Email, user.Email), new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };
        if (memberId.HasValue) claims.Add(new Claim("member_id", memberId.Value.ToString()));
        claims.AddRange(roles.Select(role => new Claim(ClaimTypes.Role, role)));
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(configuration["Jwt:Key"]!)), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(configuration["Jwt:Issuer"], configuration["Jwt:Audience"], claims,
            expires: expires.UtcDateTime, signingCredentials: credentials);
        return new AuthResponse(new JwtSecurityTokenHandler().WriteToken(token), expires,
            user.Id, memberId, user.FullName, user.Email, roles);
    }
}
