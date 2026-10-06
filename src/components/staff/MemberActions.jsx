import React from 'react';
import { MoreVertical, ShieldCheck, User, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BAR_ADMIN, personName } from '@/lib/rbac';

// Per-member action menu. The owner has no actions (badge only, handled by
// the parent); your own row can change nothing that would lock you out.
export default function MemberActions({ member, isSelf, busy, onSetRole, onRemove }) {
  const isAdmin = member.app_role === BAR_ADMIN;
  const name = personName(member);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" disabled={busy} aria-label={`Acciones para ${name}`}>
          <MoreVertical className="w-5 h-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[13rem]">
        {isAdmin ? (
          <DropdownMenuItem className="py-3" onSelect={() => onSetRole(member, 'staff')}>
            <User className="w-4 h-4 mr-2" /> Hacer equipo
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem className="py-3" onSelect={() => onSetRole(member, BAR_ADMIN)}>
            <ShieldCheck className="w-4 h-4 mr-2" /> Hacer administrador
          </DropdownMenuItem>
        )}
        {!isSelf && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="py-3 text-destructive focus:text-destructive" onSelect={() => onRemove(member)}>
              <UserMinus className="w-4 h-4 mr-2" /> Quitar del equipo
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
