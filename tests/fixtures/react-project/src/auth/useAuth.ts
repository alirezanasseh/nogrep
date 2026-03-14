import { useState } from "react";

export function useAuth() {
  const [user, setUser] = useState<string | null>(null);
  const login = () => setUser("demo");
  const logout = () => setUser(null);
  return { user, login, logout };
}
