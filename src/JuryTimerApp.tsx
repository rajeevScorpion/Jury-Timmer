import LiveJuryView from "@/components/LiveJuryView";
import { useSession } from "@/context/SessionContext";

export default function JuryTimerApp() {
  const { activeSession } = useSession();
  if (!activeSession) return null;
  return <LiveJuryView activeSession={activeSession} />;
}
