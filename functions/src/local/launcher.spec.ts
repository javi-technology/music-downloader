import { describe, expect, it, vi } from "vitest";
import { PortInUseError, browserCommand, launch } from "./launcher.js";

describe("browserCommand", () => {
  const url = "http://127.0.0.1:47823";

  it("macOS: open", () => {
    expect(browserCommand("darwin", url)).toEqual({
      command: "open",
      args: [url],
    });
  });

  it("Windows: start pelo cmd (título vazio antes da URL)", () => {
    expect(browserCommand("win32", url)).toEqual({
      command: "cmd",
      args: ["/c", "start", '""', url],
    });
  });

  it("Linux: xdg-open", () => {
    expect(browserCommand("linux", url)).toEqual({
      command: "xdg-open",
      args: [url],
    });
  });
});

describe("launch", () => {
  const app = { url: "http://127.0.0.1:47823", close: vi.fn() };
  const inUse = () =>
    Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" });

  it("sobe o app e abre o navegador nele", async () => {
    const openBrowser = vi.fn();

    const result = await launch({
      port: 47823,
      start: vi.fn().mockResolvedValue(app),
      isOurApp: vi.fn(),
      openBrowser,
    });

    expect(result).toEqual({ app, url: app.url });
    expect(openBrowser).toHaveBeenCalledWith(app.url);
  });

  it("com o app já aberto na porta, só abre o navegador nele", async () => {
    const openBrowser = vi.fn();
    const isOurApp = vi.fn().mockResolvedValue(true);

    const result = await launch({
      port: 47823,
      start: vi.fn().mockRejectedValue(inUse()),
      isOurApp,
      openBrowser,
    });

    expect(result).toEqual({ url: "http://127.0.0.1:47823" });
    expect(isOurApp).toHaveBeenCalledWith("http://127.0.0.1:47823");
    expect(openBrowser).toHaveBeenCalledWith("http://127.0.0.1:47823");
  });

  it("porta ocupada por outro programa é um erro claro", async () => {
    const openBrowser = vi.fn();

    await expect(
      launch({
        port: 47823,
        start: vi.fn().mockRejectedValue(inUse()),
        isOurApp: vi.fn().mockResolvedValue(false),
        openBrowser,
      }),
    ).rejects.toThrow(PortInUseError);
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it("outros erros ao subir são repassados", async () => {
    const error = new Error("disco cheio");

    await expect(
      launch({
        port: 47823,
        start: vi.fn().mockRejectedValue(error),
        isOurApp: vi.fn(),
        openBrowser: vi.fn(),
      }),
    ).rejects.toBe(error);
  });

  it("falha ao abrir o navegador não derruba o app", async () => {
    const result = await launch({
      port: 47823,
      start: vi.fn().mockResolvedValue(app),
      isOurApp: vi.fn(),
      openBrowser: vi.fn(() => {
        throw new Error("sem navegador");
      }),
    });

    expect(result.app).toBe(app);
  });
});
