import { useQuery } from "@tanstack/react-query";
import { client } from "../api/client";

export function useMetrics() {
  return useQuery({
    queryKey: ["metrics"],
    queryFn: () => client.get("/metrics").then((r) => r.data),
  });
}
