import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Bot, ChevronDown } from 'lucide-react';

export const interactionMenuLinkClass = ({isActive}:{isActive:boolean}) =>
  'flex items-center gap-2 h-8 px-3 rounded text-sm transition-colors hover:bg-sidebar-accent/60 hover:text-foreground ' +
  (isActive ? 'bg-primary/10 text-primary font-medium' : 'text-foreground/70');

export function InteractionExtraTools({items}:{items:{to:string;label:string}[]}) {
  const {pathname}=useLocation();
  const active=items.some(item=>pathname===item.to||pathname.startsWith(item.to+'/'));
  const [expanded,setExpanded]=useState(active);
  useEffect(()=>{if(active)setExpanded(true);},[pathname,active]);
  return <details className="matrix-extra-interaction-tools" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}>
    <summary><Bot size={18}/><span>更多工具</span><ChevronDown className="matrix-tools-chevron" size={16}/></summary>
    <nav aria-label="更多互动工具" className="space-y-0.5">{items.map(item=><NavLink key={item.to} to={item.to} end className={interactionMenuLinkClass}><span>{item.label}</span></NavLink>)}</nav>
  </details>;
}
