"use client";

import { motion, AnimatePresence } from "framer-motion";

export default function WeeklyBonusModal({
    open,
    onClose,
    date,
    hr,
    min,
    sec,
}: {
    open: boolean;
    onClose: () => void;
    date: string;
    hr: string;
    min: string;
    sec: string;
}) {
    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.div
                        onClick={(e) => e.stopPropagation()}
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="relative border border-yellow-400/30 shadow-[0_0_25px_rgba(250,204,21,0.25)]  bg-[#0c1424]/60  rounded-xl  shadow-2xl 
                       max-w-sm w-full max-h-[95vh] overflow-y-auto"
                    >
                        {/* Close X */}
                        <button
                            onClick={onClose}
                            className="absolute top-2 right-2 w-6 h-6 bg-white/20 hover:bg-white/30 
                         rounded-full flex items-center justify-center text-white hover:text-red-300 text-sm"
                        >
                            ✕
                        </button>

                        {/* Header */}
                        <div className="p-4 text-center">
                            <h2 className="text-lg font-bold text-white mb-1">
                                Weekly Winners from Yes Bingo!
                            </h2>
                            <p className="text-yellow-300 text-sm font-medium">
                                Weekly Bonus Yes Bingo!
                            </p>
                        </div>

                        {/* Countdown + Prize */}
                        <div className="px-4">
                            <div className="bg-gradient-to-r from-yellow-400/20 to-orange-500/20 rounded-lg p-3 mb-3 text-center border border-yellow-400/30">
                                <div className="text-xs text-white/70 mb-2">Time Until Next Week</div>

                                <div className="flex justify-center gap-2 mb-2">
                                    {[date, hr, min, sec].map((t, i) => (
                                        <div
                                            key={i}
                                            className="bg-yellow-400/20 border border-yellow-400/40 rounded px-2 py-1 min-w-[40px]"
                                        >
                                            <div className="text-lg font-bold text-yellow-400">{t}</div>
                                        </div>
                                    ))}
                                </div>

                                <div className="text-2xl font-bold text-yellow-400">2000</div>
                                <div className="text-white/90 text-sm">Total Prize Pool</div>
                                <div className="text-yellow-300 text-xs mt-1">
                                    10 players will share this prize pool.
                                </div>
                            </div>

                            {/* Prize Distribution */}
                            <div className="bg-white/10 rounded-lg p-3 mb-3">
                                <h3 className="text-base font-semibold text-white mb-3 text-center">
                                    🏆 Prize Distribution
                                </h3>

                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {[
                                        ["🥇", "1st Place", "1,000"], 
                                        ["🥈", "2nd Place", "500"],
                                        ["🥉", "3rd Place", "375"],
                                        ["4️⃣", "4th Place", "125"],
                                        ["5️⃣", "5th Place", "50"],
                                       
                                    ].map(([icon, label, price], i) => (
                                        <div
                                            key={i}
                                            className="flex justify-between items-center bg-yellow-400/20 rounded-lg p-2 border border-yellow-400/30"
                                        >
                                            <div className="flex items-center gap-2 text-sm text-white">
                                                <span>{icon}</span>
                                                <span>{label}</span>
                                            </div>
                                            <span className="text-yellow-400 font-bold">{price}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Close Button */}
                        {/* <div className="p-4 pt-0">
                            <button
                                onClick={onClose}
                                className="w-full bg-gradient-to-r from-[#48dfcb] to-[#056882] 
                           hover:from-[#056882] hover:to-[#48dfcb] 
                           text-white font-semibold py-2.5 rounded-lg transition-all"
                            >
                                Close
                            </button>
                        </div> */}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
