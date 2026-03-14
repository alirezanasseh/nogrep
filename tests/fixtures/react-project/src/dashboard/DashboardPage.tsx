import { useMetrics } from "./useMetrics";

export function DashboardPage() {
  const { data } = useMetrics();
  return <div>{JSON.stringify(data)}</div>;
}
