"use client";

import React from "react";
import Header from "@/components/Header";
import ModelSidebar from "@/components/ModelSidebar";
import ChatInterface from "@/components/ChatInterface";
import DebugConsole from "@/components/DebugConsole";
import SiteFooter from "@/components/SiteFooter";

export default function Home() {
  return (
      <div className="flex flex-col h-dvh overflow-hidden pb-10 bg-gray-950 text-gray-100 font-sans selection:bg-blue-600 selection:text-white">
        <Header />
        <div className="workspace-row flex flex-1 min-h-0 overflow-hidden">
          <ModelSidebar />
          <main className="flex-1 min-w-0 min-h-0">
            <ChatInterface />
          </main>
        </div>
        <SiteFooter />
        <DebugConsole />
      </div>
  );
}
