import { createContext, useContext, useState, ReactNode } from "react";

interface CategoryContextType {
  currentCategoryId: string | null;
  categoryName: string | null;
  setCategoryContext: (id: string | null, name: string | null) => void;
}

const CategoryContext = createContext<CategoryContextType | undefined>(undefined);

export function CategoryProvider({ children }: { children: ReactNode }) {
  const [currentCategoryId, setCurrentCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);

  const setCategoryContext = (id: string | null, name: string | null) => {
    setCurrentCategoryId(id);
    setCategoryName(name);
  };

  return (
    <CategoryContext.Provider value={{ currentCategoryId, categoryName, setCategoryContext }}>
      {children}
    </CategoryContext.Provider>
  );
}

export function useCategoryContext() {
  const context = useContext(CategoryContext);
  if (context === undefined) {
    throw new Error("useCategoryContext must be used within a CategoryProvider");
  }
  return context;
}
