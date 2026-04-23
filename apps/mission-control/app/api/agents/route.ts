import { jsonRoute } from "@/lib/api-route";
import { getAgents } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = jsonRoute({
  noStore: true,
  handler: async () => ({ agents: await getAgents() }),
});
