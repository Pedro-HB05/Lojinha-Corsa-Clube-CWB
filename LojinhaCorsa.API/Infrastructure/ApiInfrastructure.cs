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
            var detail = ParseDbError(ex);
            await WriteProblem(context, detail.status, detail.message);
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            // O navegador do cliente cancelou a requisição (ex: recarregou ou trocou de página)
            logger.LogInformation("Requisição cancelada pelo cliente (RequestAborted). Path: {Path}", context.Request.Path);
        }
        catch (OperationCanceledException ex)
        {
            logger.LogWarning(ex, "Operação cancelada por tempo limite ou banco ocupado. Path: {Path}", context.Request.Path);
            await WriteProblem(context, StatusCodes.Status504GatewayTimeout,
                "O servidor de banco de dados demorou para responder. Por favor, tente novamente.");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Erro não tratado. TraceId: {TraceId}", context.TraceIdentifier);
            var detail = ex.InnerException != null ? $"{ex.Message} ({ex.InnerException.Message})" : ex.Message;
            await WriteProblem(context, StatusCodes.Status500InternalServerError, detail);
        }
    }

    private static (int status, string message) ParseDbError(DbUpdateException ex)
    {
        if (ex.InnerException is Npgsql.PostgresException pg)
        {
            return pg.SqlState switch
            {
                "23505" => (StatusCodes.Status409Conflict, pg.ConstraintName switch
                {
                    "products_slug_key" => "Já existe um produto com este identificador (slug). Tente um nome diferente.",
                    var c when c?.Contains("email") == true => "Já existe um cadastro com este e-mail.",
                    var c when c?.Contains("slug") == true => "Já existe um registro com este identificador. Tente um nome diferente.",
                    _ => $"Registro duplicado: já existe um registro com estes dados ({pg.ConstraintName})."
                }),
                "23503" => (StatusCodes.Status400BadRequest,
                    "Não foi possível completar a operação porque há registros relacionados que dependem deste dado."),
                "23514" => (StatusCodes.Status400BadRequest,
                    "Os dados informados não atendem às regras de validação do sistema."),
                _ => (StatusCodes.Status409Conflict,
                    "A operação viola uma regra de integridade do banco de dados.")
            };
        }
        return (StatusCodes.Status409Conflict,
            "A operação viola uma regra de integridade ou utiliza dados duplicados.");
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
