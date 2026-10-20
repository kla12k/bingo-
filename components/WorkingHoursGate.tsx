import React, { useCallback, useEffect, useState } from "react";
import { KineticLoader } from "@/components/KineticLoader";
import WorkingHoursClosed, { type WorkingHoursPayload } from "@/components/WorkingHoursClosed";

type Props = {
  children: React.ReactNode;
};

export default function WorkingHoursGate({ children }: Props) {
  const [data, setData] = useState<WorkingHoursPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/working-hours", { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const json = (await res.json()) as WorkingHoursPayload;
      setData(json);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 60_000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        <div className="flex flex-col items-center gap-6">
          <KineticLoader variant="ring" size="lg" />
          <p className="text-muted-foreground font-medium animate-pulse">ቢንጎ እየተጫነ ነው…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <>{children}</>;
  }

  if (!data.isOpen) {
    return <WorkingHoursClosed data={data} onOpen={fetchStatus} />;
  }

  return <>{children}</>;
}
