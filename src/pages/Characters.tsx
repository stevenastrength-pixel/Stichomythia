import { useState } from 'react';
import { useCharacters } from '@/hooks/useCharacters';
import type { Character } from '@/types';
import { CharacterList } from '@/components/characters/CharacterList';
import { CharacterEditor } from '@/components/characters/CharacterEditor';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export function Characters() {
  const { characters, loading, create, update, remove } = useCharacters();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = characters.find((c) => c.id === selectedId) ?? null;

  const handleNew = async () => {
    const colors = ['#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C'];
    const color = colors[characters.length % colors.length];
    const char = await create({ color });
    setSelectedId(char.id);
  };

  const handleSave = async (data: Partial<Character>) => {
    if (!selectedId) return;
    await update(selectedId, data);
  };

  const handleDelete = async (id: string) => {
    await remove(id);
    if (selectedId === id) setSelectedId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <p className="text-muted-foreground">Loading characters...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-64 border-r border-border p-4 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">
            Characters
          </h2>
          <Button size="icon" variant="ghost" onClick={handleNew}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <CharacterList
          characters={characters}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <CharacterEditor
            character={selected}
            onSave={handleSave}
            onDelete={handleDelete}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <p className="mb-4">Select a character to edit, or create a new one.</p>
              <Button onClick={handleNew}>
                <Plus className="w-4 h-4 mr-2" />
                New Character
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
