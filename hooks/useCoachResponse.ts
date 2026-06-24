import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseCoachResponseResult {
  message: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useCoachResponse(
  studentId: string | null | undefined,
  trigger?: string,
  endpointUrl?: string
): UseCoachResponseResult {
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const url = endpointUrl ?? import.meta.env.VITE_COACH_ENDPOINT;
        const { data, error: invokeError } = url
          ? await supabase.functions.invoke(url, { body: { studentId, trigger } })
          : await supabase.functions.invoke("coach-respond", { body: { studentId, trigger } });
        if (cancelled) return;
        if (invokeError) {
          setError(invokeError.message ?? "Coach unavailable");
          setMessage(null);
        } else {
          setMessage(typeof data?.message === "string" ? data.message : null);
        }
      } catch (err) {
        if (!cancelled) setMessage(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [studentId, trigger, endpointUrl]);

  return { message, isLoading, error };
}
