import React, { createContext, useContext, useState } from 'react';

export interface CardLayout {
  id: string;
  column: number;
  order: number;
}

interface WorkspaceContextProps {
  activeCards: string[];
  cardLayout: CardLayout[];
  activeDrawer: 'settings' | null;
  setActiveDrawer: (drawer: 'settings' | null) => void;
  toggleCard: (cardId: string) => void;
  updateLayout: (newLayout: CardLayout[]) => void;
}

const defaultCardLayout: CardLayout[] = [
  { id: 'chat', column: 0, order: 0 },
  { id: 'canvas', column: 1, order: 0 }
];

const WorkspaceContext = createContext<WorkspaceContextProps | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeCards, setActiveCards] = useState<string[]>(['chat', 'canvas']);
  const [cardLayout, setCardLayout] = useState<CardLayout[]>(defaultCardLayout);
  const [activeDrawer, setActiveDrawer] = useState<'settings' | null>(null);

  const toggleCard = (cardId: string) => {
    setActiveCards((prev) => {
      if (prev.includes(cardId)) {
        return prev.filter((id) => id !== cardId);
      } else {
        return [...prev, cardId];
      }
    });
    setCardLayout((prev) => {
      if (prev.some(c => c.id === cardId)) return prev;
      const usedColumns = [...new Set(prev.map(c => c.column))];
      const targetCol = usedColumns.includes(0) ? (usedColumns.includes(1) ? 2 : 1) : 0;
      const maxOrder = Math.max(-1, ...prev.filter(c => c.column === targetCol).map(c => c.order)) + 1;
      return [...prev, { id: cardId, column: targetCol, order: maxOrder }];
    });
  };

  const updateLayout = (newLayout: CardLayout[]) => {
    setCardLayout(newLayout);
  };

  return (
    <WorkspaceContext.Provider value={{
      activeCards,
      cardLayout,
      activeDrawer,
      setActiveDrawer,
      toggleCard,
      updateLayout
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within a WorkspaceProvider');
  return context;
};
