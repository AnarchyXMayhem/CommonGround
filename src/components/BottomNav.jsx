import React, { memo, useContext } from 'react';
import { Home, MessageSquare, Users, User } from 'lucide-react';
import { AppContext } from '../AppContext';

const TabButton = ({ active, id, label, icon: Icon, onClick }) => {
  const isActive = active === id;
  
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-colors ${
        isActive
          ? 'text-purple-400'
          : 'text-gray-400 hover:text-gray-300'
      }`}
    >
      <Icon size={24} />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
};

export const MemoizedTabButton = memo(TabButton);

const BottomNav = memo(() => {
  const { state, dispatch } = useContext(AppContext);
  const { tab, ui } = state;
  const { appMode } = ui;
  
  if (appMode === 'deeply') return null;
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#1a0b2e]/95 backdrop-blur-lg border-t border-white/5 h-20 z-30">
      <div className="grid grid-cols-4 h-full max-w-2xl mx-auto px-2">
        <MemoizedTabButton active={tab} id="today" label="Today" icon={Home} onClick={(id) => dispatch({ type: 'SET_TAB', payload: id })} />
        <MemoizedTabButton active={tab} id="chat" label="Chat" icon={MessageSquare} onClick={(id) => dispatch({ type: 'SET_TAB', payload: id })} />
        <MemoizedTabButton active={tab} id="us" label="Us" icon={Users} onClick={(id) => dispatch({ type: 'SET_TAB', payload: id })} />
        <MemoizedTabButton active={tab} id="me" label="Me" icon={User} onClick={(id) => dispatch({ type: 'SET_TAB', payload: id })} />
      </div>
    </nav>
  );
});

BottomNav.displayName = 'BottomNav';

export default BottomNav;
