import Link from "next/link";
import Head from "next/head";
import React, { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/router";
import Image from "next/image";
import { ArrowUpRight, Gamepad2 } from "lucide-react";

import { useUser } from "@/api/session";
import { BRAND, pageTitle } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage() {
  const CARD_DATA = [
    {
      title: "Join Random Game",
      description: "Play with random players around the world in real-time.",
      button: "Join Now",
      imageSrc: BRAND.promoImage,
      isDisabled: false,
      path: "/stake",
    },
    {
      title: "Weekly Bingo",
      description: "Join the big weekly game — pick your card and win the prize pool.",
      button: "Play Weekly",
      imageSrc: "/friend.png",
      isDisabled: false,
      path: "/group",
    },
    {
      title: "Play House",
      description: "Enter bingo rooms to play with the system and win big rewards.",
      button: "Coming Soon",
      imageSrc: "/house.png",
      isDisabled: true,
      path: "/stake",
    },
  ];

  const router = useRouter();
  useUser();
  const [cardsLoaded, setCardsLoaded] = useState(false);

  useEffect(() => {
    setCardsLoaded(true);
  }, []);

  const handleEnter = (path: string) => {
    startTransition(() => {
      router.push(path);
    });
  };

  return (
    <>
      <Head>
        <title>{pageTitle("Home")}</title>
        <meta name="description" content={`Join ${BRAND.name} — real-time multiplayer bingo.`} />
      </Head>

      <main className="relative min-h-[calc(100vh-64px)] overflow-hidden px-5 py-12 text-foreground sm:px-8 lg:py-16">
        <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden="true">
          <div className="absolute -right-24 -top-32 h-96 w-96 rounded-full border-[48px] border-[var(--primary-muted)]" />
          <div className="absolute -bottom-44 -left-20 h-80 w-80 rounded-full border-[36px] border-[rgba(var(--accent-rgb),0.16)]" />
        </div>
        <div className="relative mx-auto max-w-6xl">
          <header className="mb-10 flex flex-col gap-5 border-b border-[var(--border)] pb-8 sm:mb-12 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--primary-border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.12em] text-primary">
                <span className="h-2 w-2 rounded-full bg-[var(--success)]" />
                Live bingo rooms
              </div>
              <h1 className="max-w-2xl text-4xl font-black leading-[1.04] sm:text-5xl">
                {BRAND.welcomeTitle}
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
                {BRAND.welcomeSubtitle}
              </p>
            </div>
            <div className="hidden shrink-0 items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:flex">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-[var(--primary-muted)] text-primary">
                <Gamepad2 size={21} aria-hidden="true" />
              </span>
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.08em] text-muted">Choose a mode</div>
                <div className="font-extrabold">Your game starts here</div>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {cardsLoaded ? (
            CARD_DATA.map((data, i) => (
              <Card
                key={i}
                className="group relative w-full overflow-hidden rounded-lg border border-[var(--border)] bg-surface text-foreground shadow-[0_12px_32px_rgba(18,59,59,0.07)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(18,59,59,0.13)]"
              >
                <div className="relative h-48 w-full overflow-hidden bg-[var(--surface-elevated)]">
                  <div className="absolute inset-0 z-10 bg-gradient-to-t from-[#123b3b]/55 via-transparent to-transparent" />
                  <Image
                    src={data.imageSrc}
                    alt={data.title}
                    fill
                    sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 33vw"
                    loading={i === 0 ? "eager" : "lazy"}
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <span className="absolute left-4 top-4 z-20 rounded-md bg-white/90 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-[var(--foreground)]">
                    {i === 0 ? "Real-time" : i === 1 ? "Weekly event" : "Solo mode"}
                  </span>
                </div>

                <CardHeader className="pb-2 pt-5">
                  <CardTitle className="text-xl font-extrabold text-foreground">
                    {data.title}
                  </CardTitle>
                </CardHeader>

                <CardContent className="min-h-[3.5rem] px-6 py-2 text-sm leading-relaxed text-muted">
                  {data.description}
                </CardContent>

                <CardFooter className="flex justify-center p-5 pt-3">
                  <Button
                    onClick={() => handleEnter(data.path)}
                    disabled={data.isDisabled}
                    className={`flex w-full items-center justify-between rounded-md px-4 py-5 font-bold transition-colors ${data.isDisabled
                      ? "cursor-not-allowed bg-[var(--surface-elevated)] text-muted"
                      : "bg-primary text-white hover:bg-[var(--primary-hover)]"
                      }`}
                  >
                    <span className="flex items-center gap-2"><Gamepad2 size={18} aria-hidden="true" />{data.button}</span>
                    {!data.isDisabled && <ArrowUpRight size={18} aria-hidden="true" />}
                  </Button>
                </CardFooter>
              </Card>
            ))
          ) : (
            <div className="col-span-full grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[25rem] animate-pulse rounded-lg border border-[var(--border)] bg-surface" />
              ))}
            </div>
          )}
          </div>
        </div>
      </main>
    </>
  );
}