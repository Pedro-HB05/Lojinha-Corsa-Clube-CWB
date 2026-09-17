using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LojinhaCorsa.API.Infrastructure;

public sealed class AppException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

public sealed class ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (AppException ex)
        {
            await WriteProblem(context, ex.StatusCode, ex.Message);
        }
        catch (DbUpdateException ex)
        {
            logger.LogWarning(ex, "Falha de integridade ao persistir dados.");
            await WriteProblem(context, StatusCodes.Status409Conflict,
                "A operação viola uma regra de integridade ou utiliza dados duplicados.");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Erro não tratado. TraceId: {TraceId}", context.TraceIdentifier);
            await WriteProblem(context, StatusCodes.Status500InternalServerError,
                "Ocorreu um erro interno. Informe o identificador da requisição ao suporte.");
        }
    }

    private static async Task WriteProblem(HttpContext context, int statusCode, string detail)
    {
        if (context.Response.HasStarted) return;
        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "application/problem+json";
        var problem = new ProblemDetails
        {
            Status = statusCode,
            Title = statusCode >= 500 ? "Erro interno" : "Operação não permitida",
            Detail = detail,
            Instance = context.Request.Path
        };
        problem.Extensions["traceId"] = context.TraceIdentifier;
        await context.Response.WriteAsJsonAsync(problem);
    }
}

public interface ICurrentUser
{
    Guid UserId { get; }
    Guid? MemberId { get; }
    bool IsAdministrator { get; }
}

public sealed class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal Principal => accessor.HttpContext?.User
        ?? throw new AppException(StatusCodes.Status401Unauthorized, "Usuário não autenticado.");

    public Guid UserId => ParseGuid(ClaimTypes.NameIdentifier);
    public Guid? MemberId => Guid.TryParse(Principal.FindFirstValue("member_id"), out var id) ? id : null;
    public bool IsAdministrator => Principal.IsInRole("administrator");

    private Guid ParseGuid(string claim) => Guid.TryParse(Principal.FindFirstValue(claim), out var id)
        ? id
        : throw new AppException(StatusCodes.Status401Unauthorized, "Token de autenticação inválido.");
}

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount)
{
    public int TotalPages => (int)Math.Ceiling(TotalCount / (double)PageSize);
}

public static class Paging
{
    public static (int Page, int PageSize) Normalize(int page, int pageSize) =>
        (Math.Max(page, 1), Math.Clamp(pageSize, 1, 100));
}
