import { describe, expect, it } from "vitest";
import { localDockerSocket } from "./local-docker.mjs";

describe("concurrency runner Docker endpoint", () => {
  it("uses the platform socket by default and supports isolated local daemons", () => {
    expect(localDockerSocket({})).toBe("unix:///var/run/docker.sock");
    expect(localDockerSocket({ DOCKER_HOST: "unix:///workspace/.setup/raffle-docker/run/docker.sock" }))
      .toBe("unix:///workspace/.setup/raffle-docker/run/docker.sock");
  });

  it.each(["tcp://localhost:2375", "ssh://server", "https://server", "unix://remote/socket", "", "unix:///tmp/socket?host=server", "unix:///tmp/socket\0"])("rejects unsafe endpoint %j", (DOCKER_HOST) => {
    expect(() => localDockerSocket({ DOCKER_HOST })).toThrow(/local Unix/);
  });
});
