import React from 'react';
import { AppMode } from '../types';
import { MessageSquare, Image, Star, BookLock, Mic, Zap, ArrowUpCircle } from 'lucide-react';

interface SidebarProps {
    currentMode: AppMode;
    setMode: (mode: AppMode) => void;
    isPro: boolean;
    userName: string;
    personalityName: string;
}

const NavItem: React.FC<{ icon: React.ReactNode; label: AppMode; currentMode: AppMode; setMode: (mode: AppMode) => void; isPro: boolean }> = ({ icon, label, currentMode, setMode, isPro }) => {
    const isActive = currentMode === label;
    const proClass = 'text-pro-text hover:bg-pro-accent/20';
    const baseClass = 'text-base-text hover:bg-base-accent/20';
    const activeProClass = 'bg-pro-accent/30 text-white shadow-lg';
    const activeBaseClass = 'bg-base-accent/30 text-white shadow-lg';
    
    const colors = isPro ? { base: proClass, active: activeProClass } : { base: baseClass, active: activeBaseClass };

    return (
        <button
            onClick={() => setMode(label)}
            className={`flex items-center w-full px-4 py-3 my-1 rounded-lg transition-all duration-200 ${colors.base} ${isActive ? colors.active : ''} interactive-glow`}
        >
            {icon}
            <span className="ml-4 font-semibold">{label}</span>
        </button>
    );
};


const Sidebar: React.FC<SidebarProps> = ({ currentMode, setMode, isPro, userName, personalityName }) => {
    const profileInitial = userName ? userName.charAt(0).toUpperCase() : personalityName.charAt(0).toUpperCase();

    return (
        <>
            <aside className="flex-shrink-0 w-64 p-4 flex flex-col glassmorphic rounded-2xl">
                <div className="flex items-center mb-8">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold text-white ${isPro ? 'bg-pro-accent' : 'bg-base-accent'}`}>
                        {profileInitial}
                    </div>
                    <div className="ml-3">
                        <h1 className={`text-xl font-bold ${isPro ? 'text-pro-text' : 'text-white'}`}>{personalityName}</h1>
                        {userName && <p className="text-sm text-gray-400">for {userName}</p>}
                    </div>
                </div>

                <nav className="flex-1">
                    <NavItem icon={<MessageSquare />} label={AppMode.CHAT} currentMode={currentMode} setMode={setMode} isPro={isPro} />
                    <NavItem icon={<Image />} label={AppMode.IMAGE_GEN} currentMode={currentMode} setMode={setMode} isPro={isPro} />
                    <NavItem icon={<Star />} label={AppMode.ASTRO_GUIDE} currentMode={currentMode} setMode={setMode} isPro={isPro} />
                    <NavItem icon={<BookLock />} label={AppMode.AI_DIARY} currentMode={currentMode} setMode={setMode} isPro={isPro} />
                    <NavItem icon={<Mic />} label={AppMode.LIVE} currentMode={currentMode} setMode={setMode} isPro={isPro} />
                </nav>

                <div className="mt-auto">
                    {isPro && (
                         <div className="w-full flex items-center justify-center px-4 py-3 rounded-lg bg-gradient-to-r from-pink-500 to-yellow-500 text-white font-bold shadow-lg">
                           <ArrowUpCircle className="mr-2 animate-pulse"/>
                            Mega Pro Activated
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
};

export default Sidebar;