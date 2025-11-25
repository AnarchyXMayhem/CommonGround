import React, { useContext } from 'react';
import BottomNav from './components/BottomNav';
import { AppContext } from './AppContext';
import './index.css';

function App() {
  const { state } = useContext(AppContext);
  const { tab } = state;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a0b2e] via-[#16213e] to-[#0f3460] text-white pb-20">
      <header className="p-6 border-b border-white/10">
        <h1 className="text-3xl font-bold">CommonGround</h1>
        <p className="text-gray-400 mt-2">Current tab: {tab}</p>
      </header>

      <main className="p-6">
        {tab === 'today' && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Today</h2>
            <p className="text-gray-300">Welcome to your today's view</p>
          </section>
        )}
        
        {tab === 'chat' && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Chat</h2>
            <p className="text-gray-300">Messages and conversations</p>
          </section>
        )}
        
        {tab === 'us' && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Us</h2>
            <p className="text-gray-300">Community and groups</p>
          </section>
        )}
        
        {tab === 'me' && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Me</h2>
            <p className="text-gray-300">Your profile and settings</p>
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

export default App;
