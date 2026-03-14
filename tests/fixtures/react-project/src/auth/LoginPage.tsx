import { useAuth } from "./useAuth";

export function LoginPage() {
  const { login } = useAuth();
  return <button onClick={login}>Log in</button>;
}
