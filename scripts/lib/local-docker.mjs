// These destructive fixture runners must never follow a remote Docker context.
// Honor a configured local socket so isolated cloud development daemons work.
export function localDockerSocket(env = process.env) {
  const socket = env.DOCKER_HOST ?? "unix:///var/run/docker.sock";
  if (!/^unix:\/\/\/[^\s?#\0]+$/.test(socket)) {
    throw new Error("Concurrency tests require a local Unix Docker socket; remote endpoints are refused.");
  }
  return socket;
}
