import React from 'react';
import Sidebar from './components/Sidebar';
import Workspace from './components/Workspace';
import SlideDrawer from './components/SlideDrawer';
import SettingsPanel from './components/SettingsPanel';
import ChatCard from './components/ChatCard';
import CanvasCard from './components/CanvasCard';
import KnowledgeCard from './components/KnowledgeCard/KnowledgeCard';
import QQBotCard from './components/QQBotCard';

import { ChatProvider } from './contexts/ChatContext';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import { CanvasProvider } from './contexts/CanvasContext';

function MainLayout() {
  const { activeCards, cardLayout, updateLayout, activeDrawer, setActiveDrawer, toggleCard } = useWorkspace();

  const renderCard = (cardId: string, onClose: () => void) => {
    switch (cardId) {
      case 'chat':
        return <ChatCard />;
      case 'canvas':
        return <CanvasCard />;
      case 'knowledge':
        return <KnowledgeCard onClose={onClose} />;
      case 'qqbot':
        return <QQBotCard />;
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* 1. Left Sidebar Navigation */}
      <Sidebar />

      {/* 2. Main Flex Workspace */}
      <div style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
        <Workspace
          activeCards={activeCards}
          cardLayout={cardLayout}
          onUpdateLayout={updateLayout}
          renderCard={(cardId, onClose) => renderCard(cardId, () => {
            toggleCard(cardId);
            onClose();
          })}
        />
      </div>

      {/* 3. Global Slide Drawers */}
      <SlideDrawer
        isOpen={activeDrawer === 'settings'}
        onClose={() => setActiveDrawer(null)}
        title="模型与 API 凭证配置"
      >
        <SettingsPanel />
      </SlideDrawer>
    </div>
  );
}

export default function App() {
  return (
    <ChatProvider>
      <WorkspaceProvider>
        <CanvasProvider>
          <MainLayout />
        </CanvasProvider>
      </WorkspaceProvider>
    </ChatProvider>
  );
}
