import { redirect } from "next/navigation";

// Redirect legacy /matches/[id] URLs to the canonical /match/[slug] path.
export default function LegacyMatchPage({ params }: { params: { id: string } }) {
  redirect(`/match/${params.id}`);
}
