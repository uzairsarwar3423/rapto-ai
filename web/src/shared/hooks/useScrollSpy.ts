import { useEffect, useState, useRef } from "react";

export function useScrollSpy(ids: string[]): [string, (id: string) => void] {
  const [activeId, setActiveId] = useState<string>(ids[0] || "");
  const isProgrammaticScrollRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setActiveIdProgrammatic = (id: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setActiveId(id);
    isProgrammaticScrollRef.current = true;
    timeoutRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 800);
  };

  useEffect(() => {
    if (ids.length === 0) return;

    const elements = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];

    const observer = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticScrollRef.current) return;

        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: "-20% 0px -70% 0px", // Tuned intersection zone
        threshold: 0,
      }
    );

    elements.forEach((el) => observer.observe(el));

    const handleScroll = () => {
      if (isProgrammaticScrollRef.current) return;

      const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollableHeight > 50) {
        const isAtBottom = window.scrollY >= scrollableHeight - 50;
        if (isAtBottom && ids.length > 0) {
          setActiveId(ids[ids.length - 1]);
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", handleScroll);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [ids]);

  return [activeId, setActiveIdProgrammatic];
}
