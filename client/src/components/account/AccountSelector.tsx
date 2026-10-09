"use client";

import { useMemo } from "react";
import { Folder, User } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@client/src/components/ui/select";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@client/src/components/ui/avatar";
import { cn } from "@/lib/utils";
import type {
  PlatformAccount,
  AccountGroup,
  PlatformType,
} from "@shared/api.interface";

export interface AccountSelectorProps {
  accounts: PlatformAccount[];
  groups: AccountGroup[];
  platform?: PlatformType | "all";
  groupId?: string | "all";
  accountId?: string | "all";
  onPlatformChange?: (p: PlatformType | "all") => void;
  onGroupChange?: (g: string | "all") => void;
  onAccountChange?: (a: string | "all") => void;
  size?: "sm" | "default";
  showAllOption?: boolean;
  placeholderAccount?: string;
  className?: string;
}

const PLATFORM_LIST: { value: PlatformType; label: string; dotColor: string }[] =
  [
    { value: "douyin", label: "抖音", dotColor: "bg-[hsl(0_0%_8%)]" },
    { value: "xiaohongshu", label: "小红书", dotColor: "bg-[hsl(350_85%_60%)]" },
    { value: "wechat", label: "视频号", dotColor: "bg-[hsl(142_45%_45%)]" },
    { value: "bilibili", label: "B站", dotColor: "bg-[hsl(200_90%_55%)]" },
  ];

const PLATFORM_LABEL_MAP: Record<PlatformType, string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  wechat: "视频号",
  bilibili: "B站",
};

function accountBelongsToGroup(
  account: PlatformAccount,
  group: AccountGroup,
): boolean {
  return account.groupName === group.groupName;
}

export default function AccountSelector({
  accounts,
  groups,
  platform = "all",
  groupId = "all",
  accountId = "all",
  onPlatformChange,
  onGroupChange,
  onAccountChange,
  size = "default",
  showAllOption = true,
  placeholderAccount = "全部账号",
  className,
}: AccountSelectorProps) {
  // 过滤后的账号（仅按平台）
  const platformAccounts = useMemo<PlatformAccount[]>(() => {
    if (platform === "all") return accounts;
    return accounts.filter((a: PlatformAccount) => a.platform === platform);
  }, [accounts, platform]);

  // 过滤后的分组：该平台下有账号的分组
  const filteredGroups = useMemo<AccountGroup[]>(() => {
    if (platform === "all") return groups;
    const groupNames = new Set<string>();
    for (const acc of platformAccounts) {
      if (acc.groupName) groupNames.add(acc.groupName);
    }
    return groups.filter((g: AccountGroup) => groupNames.has(g.groupName));
  }, [groups, platformAccounts, platform]);

  // 过滤后的账号（平台 + 分组）
  const filteredAccounts = useMemo<PlatformAccount[]>(() => {
    if (groupId === "all") return platformAccounts;
    const group = groups.find((g: AccountGroup) => g.id === groupId);
    if (!group) return platformAccounts;
    return platformAccounts.filter((a: PlatformAccount) =>
      accountBelongsToGroup(a, group),
    );
  }, [platformAccounts, groupId, groups]);

  const handlePlatformChange = (value: string) => {
    const next = value as PlatformType | "all";
    onPlatformChange?.(next);
    // 平台变更时，若当前分组在新列表中不存在则重置为全部
    if (next !== platform && groupId !== "all") {
      const stillExists =
        next === "all" ||
        filteredGroups.some((g: AccountGroup) => g.id === groupId);
      if (!stillExists) {
        onGroupChange?.("all");
        onAccountChange?.("all");
        return;
      }
    }
    // 账号级也随平台变更检查有效性
    if (next !== platform && accountId !== "all") {
      const stillHasAccount = filteredAccounts.some(
        (a: PlatformAccount) => a.id === accountId,
      );
      if (!stillHasAccount) {
        onAccountChange?.("all");
      }
    }
  };

  const handleGroupChange = (value: string) => {
    const next = value as string | "all";
    onGroupChange?.(next);
    // 分组变更时，若当前账号不在新列表中则重置为全部
    if (next !== groupId && accountId !== "all") {
      let stillHas = false;
      if (next === "all") {
        stillHas = platformAccounts.some(
          (a: PlatformAccount) => a.id === accountId,
        );
      } else {
        const group = groups.find((g: AccountGroup) => g.id === next);
        stillHas = platformAccounts.some((a: PlatformAccount) =>
          group ? accountBelongsToGroup(a, group) : false,
        );
      }
      if (!stillHas) {
        onAccountChange?.("all");
      }
    }
  };

  const handleAccountChange = (value: string) => {
    onAccountChange?.(value as string | "all");
  };

  return (
    <div
      data-ai-section-type="button"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {/* 平台选择 */}
      <Select value={platform} onValueChange={handlePlatformChange}>
        <SelectTrigger size={size} className="w-32">
          <SelectValue placeholder="全部平台" />
        </SelectTrigger>
        <SelectContent>
          {showAllOption && <SelectItem value="all">全部平台</SelectItem>}
          {PLATFORM_LIST.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-block h-2.5 w-2.5 rounded-full shrink-0",
                    p.dotColor,
                  )}
                />
                {p.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 分组选择 */}
      <Select value={groupId} onValueChange={handleGroupChange}>
        <SelectTrigger size={size} className="w-40">
          <SelectValue placeholder="全部分组" />
        </SelectTrigger>
        <SelectContent>
          {showAllOption && <SelectItem value="all">全部分组</SelectItem>}
          {filteredGroups.length === 0 && !showAllOption && (
            <SelectItem value="__empty__" disabled>
              暂无分组
            </SelectItem>
          )}
          {filteredGroups.map((g: AccountGroup) => (
            <SelectItem key={g.id} value={g.id}>
              <span className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">{g.groupName}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 账号选择 */}
      <Select value={accountId} onValueChange={handleAccountChange}>
        <SelectTrigger size={size} className="w-56">
          <SelectValue placeholder={placeholderAccount} />
        </SelectTrigger>
        <SelectContent>
          {showAllOption && <SelectItem value="all">{placeholderAccount}</SelectItem>}
          {filteredAccounts.length === 0 && !showAllOption && (
            <SelectItem value="__empty__" disabled>
              暂无账号
            </SelectItem>
          )}
          {filteredAccounts.map((acc: PlatformAccount) => (
            <SelectItem key={acc.id} value={acc.id}>
              <span className="flex items-center gap-2 w-full min-w-0">
                <Avatar className="h-6 w-6 shrink-0">
                  {acc.avatarUrl ? (
                    <AvatarImage src={acc.avatarUrl} alt={acc.nickname ?? ""} />
                  ) : null}
                  <AvatarFallback className="text-[10px]">
                    <User className="h-3 w-3" />
                  </AvatarFallback>
                </Avatar>
                <span className="flex flex-col items-start min-w-0 flex-1">
                  <span className="truncate max-w-[160px] text-sm">
                    {acc.nickname || "未命名账号"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {PLATFORM_LABEL_MAP[acc.platform]}
                  </span>
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
