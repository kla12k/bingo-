"use client";

import Head from "next/head";
import { useUser } from "@/api/session";
import { BRAND, pageTitle } from "@/lib/brand";
import { getTermsSections } from "@/lib/terms-sections";
import { motion } from "framer-motion";
import { FiShield, FiExternalLink } from "react-icons/fi";

export default function TermsPage() {
    const { displayReference } = useUser();
    const sections = getTermsSections();

    return (
        <>
            <Head>
                <title>{pageTitle("ደንቦች እና ሁኔታዎች")}</title>
            </Head>
            <main className="min-h-screen pt-20 pb-12 px-4">
                <div className="max-w-3xl mx-auto">
                    {/* Hero Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`rounded-[2.5rem] p-10 md:p-16 border mb-8 text-center relative overflow-hidden
                            ${displayReference ? "bg-[#141621] border-white/5" : "bg-white border-green-100"}`}
                    >
                        {/* Decorative Background */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent" />

                        <div className="flex justify-center mb-6">
                            <div className="w-16 h-16 rounded-2xl bg-[var(--primary-muted)] text-primary flex items-center justify-center shadow-inner">
                                <FiShield size={32} />
                            </div>
                        </div>

                        <h1 className={`text-4xl font-black tracking-tighter mb-4 ${displayReference ? "text-white" : "text-gray-900"}`}>
                            የአገልግሎት <span className="text-primary">ደንቦች</span>
                        </h1>
                        <p className={`text-sm font-bold uppercase tracking-widest ${displayReference ? "text-gray-500" : "text-gray-400"}`}>
                            የመጨረሻ ማሻሻያ፡ ፌብሩዋሪ 12፣ 2026
                        </p>
                    </motion.div>

                    {/* Content Sections */}
                    <div className="space-y-4">
                        {sections.map((section, index) => (
                            <motion.div
                                key={section.title}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.1 + 0.2 }}
                                className={`rounded-3xl p-8 border transition-all hover:border-primary/30
                                    ${displayReference ? "bg-[#141621] border-white/5" : "bg-white border-green-100 shadow-sm"}`}
                            >
                                <div className="flex items-start gap-6">
                                    <div className={`mt-1 p-3 rounded-xl ${displayReference ? "bg-white/5 text-primary" : "bg-[var(--primary-muted)] text-primary"}`}>
                                        <section.icon size={20} />
                                    </div>
                                    <div>
                                        <h2 className={`text-xl font-black mb-3 ${displayReference ? "text-gray-100" : "text-gray-800"}`}>
                                            {section.title}
                                        </h2>
                                        <p className={`text-sm leading-relaxed font-medium ${displayReference ? "text-gray-400" : "text-gray-600"}`}>
                                            {section.content}
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Footer Notice */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8 }}
                        className={`mt-12 p-8 rounded-[2rem] border-2 border-dashed text-center
              ${displayReference ? "border-white/5 text-gray-500" : "border-gray-100 text-gray-400"}`}
                    >
                        <p className="text-xs font-bold leading-loose">
                            ስለ ደንቦቻችን ጥያቄ ካለዎት፣ እባክዎ የድጋፍ ቡድናችንን በ
                            <span className="text-primary ml-1 cursor-pointer">{BRAND.supportEmail}</span>
                            {" "}ያግኙን
                        </p>
                        <div className="flex items-center justify-center gap-6 mt-6">
                            <button className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors">
                                የግላዊነት ፖሊሲ <FiExternalLink />
                            </button>
                            <button className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors">
                                የኩኪ ፖሊሲ <FiExternalLink />
                            </button>
                        </div>
                    </motion.div>
                </div>
            </main>
        </>
    );
}
