import Head from "next/head";
import Link from "next/link";
import { motion } from "framer-motion";
import { FiHome, FiSearch } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

export default function Custom404() {
  return (
    <>
      <Head>
        <title>{`Page not found — ${BRAND.nameCompact}`}</title>
      </Head>

      <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center p-6 relative overflow-hidden bg-background">
        {/* Background Decorative Elements */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/10 blur-[120px] rounded-full pointer-events-none animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/5 blur-[150px] rounded-full pointer-events-none animate-bounce-slow" />

        <motion.div
          className="text-center max-w-lg relative z-10"
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
            hidden: {},
          }}
        >
          {/* Icon Badge */}
          <motion.div
            variants={{
              hidden: { opacity: 0, scale: 0.5 },
              visible: { opacity: 1, scale: 1, transition: { type: "spring" } }
            }}
            className="inline-flex items-center justify-center p-6 rounded-[2.5rem] bg-surface/50 border border-border/50 shadow-2xl mb-8 backdrop-blur-xl"
          >
            <FiSearch className="text-5xl text-primary animate-pulse" />
          </motion.div>

          <motion.p
            className="text-8xl md:text-9xl font-black text-primary tracking-tighter leading-none select-none drop-shadow-[0_0_20px_rgba(54,251,158,0.2)]"
            variants={{
              hidden: { opacity: 0, scale: 0.5, y: 20 },
              visible: {
                opacity: 1,
                scale: 1,
                y: 0,
                transition: { type: "spring", stiffness: 200, damping: 20 },
              },
            }}
          >
            404
          </motion.p>

          <motion.h1
            className="mt-6 text-2xl md:text-3xl font-black text-foreground uppercase tracking-tight"
            variants={{
              hidden: { opacity: 0, y: 12 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
            }}
          >
            THIS NUMBER WASN&apos;T CALLED
          </motion.h1>

          <motion.p
            className="mt-4 text-muted-foreground font-bold uppercase tracking-wider text-sm max-w-md mx-auto"
            variants={{
              hidden: { opacity: 0, y: 12 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
            }}
          >
            THE PAGE YOU&apos;RE LOOKING FOR DOESN&apos;T EXIST OR HAS BEEN MOVED TO ANOTHER ROOM.
          </motion.p>

          <motion.div
            variants={{
              hidden: { opacity: 0, y: 12 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
            }}
            className="mt-12 flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link href="/">
              <Button
                className="px-10 py-7 rounded-2xl bg-primary text-black font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-xl shadow-primary/20 flex items-center gap-3 active:scale-95"
              >
                <FiHome className="text-lg" /> Back to Base
              </Button>
            </Link>
          </motion.div>
        </motion.div>

        <style jsx>{`
          @keyframes bounce-slow {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-20px); }
          }
          .animate-bounce-slow {
            animation: bounce-slow 6s ease-in-out infinite;
          }
        `}</style>
      </div>
    </>
  );
}
