--
-- PostgreSQL database dump
--

\restrict UWUQRaodCToJvMj47momplN2WC5eB6RlmUmF4K2MkKUhfDfXwe9wpskryMIBe7l

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: file_attachment; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.file_attachment AS (
	bucket_id text,
	file_path text
);


--
-- Name: user_profile; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_profile AS (
	user_id text
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    group_name character varying(100) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: activation_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activation_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(50) NOT NULL,
    plan_id uuid NOT NULL,
    duration_days integer NOT NULL,
    max_accounts integer NOT NULL,
    status character varying(20) DEFAULT 'unused'::character varying NOT NULL,
    user_id uuid,
    activated_at timestamp(6) with time zone,
    batch_no character varying(50),
    remark character varying(255),
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _created_by public.user_profile DEFAULT 
CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::public.user_profile
    ELSE ROW(current_setting('app.user_id'::text, true))::public.user_profile
END,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    nickname character varying(100),
    role character varying(20) DEFAULT 'admin'::character varying NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    must_change_pwd boolean DEFAULT true NOT NULL,
    last_login_at timestamp(6) with time zone,
    last_login_ip character varying(45),
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(200) NOT NULL,
    content text NOT NULL,
    summary character varying(500),
    category character varying(30) DEFAULT 'system'::character varying NOT NULL,
    is_published boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: app_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username character varying(50) NOT NULL,
    email character varying(255),
    phone character varying(20),
    password_hash character varying(255) NOT NULL,
    nickname character varying(100),
    avatar_url text,
    vip_plan_id uuid,
    vip_expires_at timestamp(6) with time zone,
    vip_status character varying(20) DEFAULT 'inactive'::character varying NOT NULL,
    max_accounts integer DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    last_login_at timestamp(6) with time zone,
    last_login_ip character varying(45),
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: auto_message_task_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auto_message_task_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    target_platform_id character varying(100) NOT NULL,
    target_nickname character varying(200),
    target_avatar_url text,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    fail_reason character varying(200),
    scheduled_at timestamp(6) with time zone,
    sent_at timestamp(6) with time zone,
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: auto_message_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auto_message_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    task_name character varying(200) NOT NULL,
    sender_account_id uuid NOT NULL,
    msg_type character varying(20) DEFAULT 'text'::character varying NOT NULL,
    content text,
    media_url text,
    link_title character varying(200),
    link_url text,
    total_count integer DEFAULT 0 NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    fail_count integer DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    frequency_limit_hour integer DEFAULT 30 NOT NULL,
    frequency_limit_day integer DEFAULT 200 NOT NULL,
    min_interval_seconds integer DEFAULT 30 NOT NULL,
    max_interval_seconds integer DEFAULT 90 NOT NULL,
    started_at timestamp(6) with time zone,
    completed_at timestamp(6) with time zone,
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: auto_reply_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auto_reply_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    account_id uuid,
    platform character varying(20),
    rule_type character varying(30) NOT NULL,
    rule_name character varying(100) NOT NULL,
    keywords text[],
    match_mode character varying(20) DEFAULT 'exact'::character varying NOT NULL,
    reply_content text,
    reply_type character varying(20) DEFAULT 'text'::character varying NOT NULL,
    reply_media_url text,
    time_start time without time zone,
    time_end time without time zone,
    priority integer DEFAULT 0 NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    hit_count integer DEFAULT 0 NOT NULL,
    effective_from timestamp(6) with time zone,
    effective_to timestamp(6) with time zone,
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: comment_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    account_id uuid NOT NULL,
    post_id uuid,
    platform character varying(20) NOT NULL,
    comment_platform_id character varying(100),
    commenter_nickname character varying(200),
    commenter_avatar_url text,
    content text NOT NULL,
    like_count integer DEFAULT 0 NOT NULL,
    reply_count integer DEFAULT 0 NOT NULL,
    parent_comment_id uuid,
    is_replied boolean DEFAULT false NOT NULL,
    reply_content text,
    replied_at timestamp(6) with time zone,
    is_sensitive boolean DEFAULT false NOT NULL,
    status character varying(20) DEFAULT 'published'::character varying NOT NULL,
    commented_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    reply_account_id uuid,
    reply_fail_reason character varying(200),
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: content_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    account_id uuid NOT NULL,
    platform character varying(20) NOT NULL,
    title character varying(500),
    content text,
    cover_url text,
    tags text[],
    media_type character varying(20) DEFAULT 'text'::character varying NOT NULL,
    media_urls text[],
    platform_post_id character varying(100),
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    scheduled_at timestamp(6) with time zone,
    published_at timestamp(6) with time zone,
    fail_reason text,
    play_count integer DEFAULT 0 NOT NULL,
    like_count integer DEFAULT 0 NOT NULL,
    comment_count integer DEFAULT 0 NOT NULL,
    share_count integer DEFAULT 0 NOT NULL,
    collect_count integer DEFAULT 0 NOT NULL,
    extra_data jsonb,
    auto_follow_up boolean DEFAULT false NOT NULL,
    follow_up_content text,
    follow_up_delay_seconds integer DEFAULT 60 NOT NULL,
    follow_up_status character varying(20) DEFAULT 'none'::character varying,
    follow_up_fail_reason character varying(200),
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: follower_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follower_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    account_id uuid NOT NULL,
    platform character varying(20) NOT NULL,
    follower_platform_id character varying(100) NOT NULL,
    nickname character varying(200),
    avatar_url text,
    followed_at timestamp(6) with time zone,
    is_mutual boolean DEFAULT false NOT NULL,
    tags text[],
    remark character varying(200),
    group_name character varying(100),
    gender character varying(10),
    location character varying(100),
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: media_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    asset_type character varying(20) DEFAULT 'image'::character varying NOT NULL,
    title character varying(200) NOT NULL,
    file_url text NOT NULL,
    file_size bigint DEFAULT 0 NOT NULL,
    file_format character varying(20),
    width integer,
    height integer,
    duration integer,
    category character varying(50),
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    description text,
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: message_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid NOT NULL,
    account_id uuid NOT NULL,
    platform character varying(20) NOT NULL,
    message_platform_id character varying(100),
    direction character varying(10) NOT NULL,
    msg_type character varying(20) DEFAULT 'text'::character varying NOT NULL,
    content text,
    media_url text,
    is_read boolean DEFAULT false NOT NULL,
    sent_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sender_account_id uuid,
    fail_reason character varying(200),
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: message_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    account_id uuid NOT NULL,
    platform character varying(20) NOT NULL,
    session_platform_id character varying(100) NOT NULL,
    user_nickname character varying(200),
    user_avatar_url text,
    last_message text,
    last_message_at timestamp(6) with time zone,
    unread_count integer DEFAULT 0 NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: message_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    platform character varying(20),
    template_type character varying(30) DEFAULT 'text'::character varying NOT NULL,
    template_name character varying(100) NOT NULL,
    title character varying(200),
    content text,
    media_url text,
    link_url text,
    audit_status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    platform_template_id character varying(100),
    is_enabled boolean DEFAULT true NOT NULL,
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: monitor_hit_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.monitor_hit_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    task_id uuid NOT NULL,
    monitor_type character varying(30) NOT NULL,
    triggered_account_id uuid NOT NULL,
    hit_keyword character varying(200),
    target_user_platform_id character varying(100),
    target_user_nickname character varying(200),
    target_user_avatar_url text,
    source_content text,
    action_type character varying(30) NOT NULL,
    action_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    action_fail_reason character varying(200),
    executed_at timestamp(6) with time zone,
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: monitor_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.monitor_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    task_name character varying(200) NOT NULL,
    monitor_type character varying(30) NOT NULL,
    monitored_account_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    keywords text[] DEFAULT '{}'::text[] NOT NULL,
    match_mode character varying(20) DEFAULT 'contains'::character varying NOT NULL,
    action_type character varying(30) DEFAULT 'reply_message'::character varying NOT NULL,
    action_account_id uuid,
    action_content text,
    action_media_url text,
    action_media_type character varying(20) DEFAULT 'text'::character varying,
    action_delay_seconds integer DEFAULT 0 NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    hit_count integer DEFAULT 0 NOT NULL,
    frequency_limit_hour integer DEFAULT 20 NOT NULL,
    frequency_limit_day integer DEFAULT 100 NOT NULL,
    min_interval_seconds integer DEFAULT 30 NOT NULL,
    max_interval_seconds integer DEFAULT 90 NOT NULL,
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type character varying(30) DEFAULT 'system'::character varying NOT NULL,
    title character varying(200) NOT NULL,
    content text,
    is_read boolean DEFAULT false NOT NULL,
    related_type character varying(50),
    related_id uuid,
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: operation_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operation_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operator_type character varying(20) DEFAULT 'admin'::character varying NOT NULL,
    operator_id uuid NOT NULL,
    operator_name character varying(100),
    action character varying(50) NOT NULL,
    target_type character varying(50),
    target_id uuid,
    detail text,
    ip_address character varying(45),
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: platform_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    platform character varying(20) NOT NULL,
    platform_user_id character varying(100),
    nickname character varying(200),
    avatar_url text,
    account_remark character varying(200),
    group_name character varying(100),
    auth_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    auth_expires_at timestamp(6) with time zone,
    followers_count integer DEFAULT 0 NOT NULL,
    following_count integer DEFAULT 0 NOT NULL,
    likes_count integer DEFAULT 0 NOT NULL,
    posts_count integer DEFAULT 0 NOT NULL,
    health_status character varying(20) DEFAULT 'normal'::character varying NOT NULL,
    access_token character varying(255),
    refresh_token character varying(255),
    raw_data jsonb,
    group_id uuid,
    remark character varying(200),
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: quick_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quick_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    category character varying(50) DEFAULT 'default'::character varying NOT NULL,
    title character varying(100) NOT NULL,
    content text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sensitive_words; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sensitive_words (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    word character varying(100) NOT NULL,
    category character varying(30) DEFAULT 'general'::character varying NOT NULL,
    level character varying(20) DEFAULT 'warn'::character varying NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    setting_key character varying(100) NOT NULL,
    setting_value text,
    setting_type character varying(20) DEFAULT 'string'::character varying NOT NULL,
    description character varying(255),
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: vip_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vip_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(50) NOT NULL,
    duration_days integer DEFAULT 30 NOT NULL,
    max_accounts integer DEFAULT 3 NOT NULL,
    price numeric DEFAULT '0'::numeric NOT NULL,
    description text,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    _created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: account_groups account_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_groups
    ADD CONSTRAINT account_groups_pkey PRIMARY KEY (id);


--
-- Name: activation_codes activation_codes_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activation_codes
    ADD CONSTRAINT activation_codes_code_unique UNIQUE (code);


--
-- Name: activation_codes activation_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activation_codes
    ADD CONSTRAINT activation_codes_pkey PRIMARY KEY (id);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: admin_users admin_users_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_username_unique UNIQUE (username);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: app_users app_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_pkey PRIMARY KEY (id);


--
-- Name: app_users app_users_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_username_unique UNIQUE (username);


--
-- Name: auto_message_task_items auto_message_task_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_message_task_items
    ADD CONSTRAINT auto_message_task_items_pkey PRIMARY KEY (id);


--
-- Name: auto_message_tasks auto_message_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_message_tasks
    ADD CONSTRAINT auto_message_tasks_pkey PRIMARY KEY (id);


--
-- Name: auto_reply_rules auto_reply_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_reply_rules
    ADD CONSTRAINT auto_reply_rules_pkey PRIMARY KEY (id);


--
-- Name: comment_items comment_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_items
    ADD CONSTRAINT comment_items_pkey PRIMARY KEY (id);


--
-- Name: content_posts content_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_posts
    ADD CONSTRAINT content_posts_pkey PRIMARY KEY (id);


--
-- Name: follower_records follower_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follower_records
    ADD CONSTRAINT follower_records_pkey PRIMARY KEY (id);


--
-- Name: media_assets media_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_pkey PRIMARY KEY (id);


--
-- Name: message_items message_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_items
    ADD CONSTRAINT message_items_pkey PRIMARY KEY (id);


--
-- Name: message_sessions message_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_sessions
    ADD CONSTRAINT message_sessions_pkey PRIMARY KEY (id);


--
-- Name: message_templates message_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_pkey PRIMARY KEY (id);


--
-- Name: monitor_hit_records monitor_hit_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monitor_hit_records
    ADD CONSTRAINT monitor_hit_records_pkey PRIMARY KEY (id);


--
-- Name: monitor_tasks monitor_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monitor_tasks
    ADD CONSTRAINT monitor_tasks_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: operation_logs operation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operation_logs
    ADD CONSTRAINT operation_logs_pkey PRIMARY KEY (id);


--
-- Name: platform_accounts platform_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_accounts
    ADD CONSTRAINT platform_accounts_pkey PRIMARY KEY (id);


--
-- Name: quick_replies quick_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_replies
    ADD CONSTRAINT quick_replies_pkey PRIMARY KEY (id);


--
-- Name: sensitive_words sensitive_words_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sensitive_words
    ADD CONSTRAINT sensitive_words_pkey PRIMARY KEY (id);


--
-- Name: sensitive_words sensitive_words_word_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sensitive_words
    ADD CONSTRAINT sensitive_words_word_unique UNIQUE (word);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_setting_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_setting_key_unique UNIQUE (setting_key);


--
-- Name: vip_plans vip_plans_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vip_plans
    ADD CONSTRAINT vip_plans_code_unique UNIQUE (code);


--
-- Name: vip_plans vip_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vip_plans
    ADD CONSTRAINT vip_plans_pkey PRIMARY KEY (id);


--
-- Name: activation_codes_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX activation_codes_code_key ON public.activation_codes USING btree (code);


--
-- Name: admin_users_username_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX admin_users_username_key ON public.admin_users USING btree (username);


--
-- Name: app_users_username_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_users_username_key ON public.app_users USING btree (username);


--
-- Name: follower_records_account_id_follower_platform_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX follower_records_account_id_follower_platform_id_key ON public.follower_records USING btree (account_id, follower_platform_id);


--
-- Name: idx_account_groups_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_account_groups_user_id ON public.account_groups USING btree (user_id);


--
-- Name: idx_announcements_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_announcements_created ON public.announcements USING btree (_created_at);


--
-- Name: idx_announcements_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_announcements_published ON public.announcements USING btree (is_published);


--
-- Name: idx_auto_message_task_items_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auto_message_task_items_status ON public.auto_message_task_items USING btree (status);


--
-- Name: idx_auto_message_task_items_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auto_message_task_items_task_id ON public.auto_message_task_items USING btree (task_id);


--
-- Name: idx_auto_message_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auto_message_tasks_status ON public.auto_message_tasks USING btree (status);


--
-- Name: idx_auto_message_tasks_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auto_message_tasks_user_id ON public.auto_message_tasks USING btree (user_id);


--
-- Name: idx_auto_reply_rules_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auto_reply_rules_user_id ON public.auto_reply_rules USING btree (user_id);


--
-- Name: idx_comment_items_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comment_items_account_id ON public.comment_items USING btree (account_id);


--
-- Name: idx_comment_items_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comment_items_post_id ON public.comment_items USING btree (post_id);


--
-- Name: idx_comment_items_replied; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comment_items_replied ON public.comment_items USING btree (account_id);


--
-- Name: idx_content_posts_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_posts_scheduled ON public.content_posts USING btree (scheduled_at);


--
-- Name: idx_content_posts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_posts_status ON public.content_posts USING btree (status);


--
-- Name: idx_content_posts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_posts_user_id ON public.content_posts USING btree (user_id);


--
-- Name: idx_follower_records_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follower_records_account_id ON public.follower_records USING btree (account_id);


--
-- Name: idx_media_assets_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_assets_category ON public.media_assets USING btree (category);


--
-- Name: idx_media_assets_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_assets_type ON public.media_assets USING btree (asset_type);


--
-- Name: idx_media_assets_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_assets_user_id ON public.media_assets USING btree (user_id);


--
-- Name: idx_message_items_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_items_sent_at ON public.message_items USING btree (sent_at);


--
-- Name: idx_message_items_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_items_session_id ON public.message_items USING btree (session_id);


--
-- Name: idx_message_sessions_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_sessions_account_id ON public.message_sessions USING btree (account_id);


--
-- Name: idx_message_sessions_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_sessions_unread ON public.message_sessions USING btree (account_id);


--
-- Name: idx_message_templates_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_templates_user_id ON public.message_templates USING btree (user_id);


--
-- Name: idx_monitor_hit_records_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monitor_hit_records_created ON public.monitor_hit_records USING btree (_created_at);


--
-- Name: idx_monitor_hit_records_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monitor_hit_records_task_id ON public.monitor_hit_records USING btree (task_id);


--
-- Name: idx_monitor_hit_records_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monitor_hit_records_user_id ON public.monitor_hit_records USING btree (user_id);


--
-- Name: idx_monitor_tasks_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monitor_tasks_enabled ON public.monitor_tasks USING btree (is_enabled);


--
-- Name: idx_monitor_tasks_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monitor_tasks_user_id ON public.monitor_tasks USING btree (user_id);


--
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_platform_accounts_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_accounts_group_id ON public.platform_accounts USING btree (group_id);


--
-- Name: idx_platform_accounts_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_accounts_platform ON public.platform_accounts USING btree (platform);


--
-- Name: idx_platform_accounts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_accounts_user_id ON public.platform_accounts USING btree (user_id);


--
-- Name: idx_quick_replies_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quick_replies_user_id ON public.quick_replies USING btree (user_id);


--
-- Name: idx_sensitive_words_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sensitive_words_enabled ON public.sensitive_words USING btree (is_enabled);


--
-- Name: message_sessions_account_id_session_platform_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX message_sessions_account_id_session_platform_id_key ON public.message_sessions USING btree (account_id, session_platform_id);


--
-- Name: sensitive_words_word_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sensitive_words_word_key ON public.sensitive_words USING btree (word);


--
-- Name: system_settings_setting_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX system_settings_setting_key_key ON public.system_settings USING btree (setting_key);


--
-- Name: vip_plans_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vip_plans_code_key ON public.vip_plans USING btree (code);


--
-- Name: activation_codes activation_codes_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activation_codes
    ADD CONSTRAINT activation_codes_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.vip_plans(id);


--
-- Name: activation_codes activation_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activation_codes
    ADD CONSTRAINT activation_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);


--
-- Name: auto_message_task_items auto_message_task_items_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_message_task_items
    ADD CONSTRAINT auto_message_task_items_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.auto_message_tasks(id) ON DELETE CASCADE;


--
-- Name: auto_message_task_items auto_message_task_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_message_task_items
    ADD CONSTRAINT auto_message_task_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: auto_message_tasks auto_message_tasks_sender_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_message_tasks
    ADD CONSTRAINT auto_message_tasks_sender_account_id_fkey FOREIGN KEY (sender_account_id) REFERENCES public.platform_accounts(id) ON DELETE CASCADE;


--
-- Name: auto_message_tasks auto_message_tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_message_tasks
    ADD CONSTRAINT auto_message_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: auto_reply_rules auto_reply_rules_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_reply_rules
    ADD CONSTRAINT auto_reply_rules_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.platform_accounts(id);


--
-- Name: auto_reply_rules auto_reply_rules_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_reply_rules
    ADD CONSTRAINT auto_reply_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);


--
-- Name: comment_items comment_items_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_items
    ADD CONSTRAINT comment_items_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.platform_accounts(id);


--
-- Name: comment_items comment_items_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_items
    ADD CONSTRAINT comment_items_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.content_posts(id);


--
-- Name: comment_items comment_items_reply_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_items
    ADD CONSTRAINT comment_items_reply_account_id_fkey FOREIGN KEY (reply_account_id) REFERENCES public.platform_accounts(id);


--
-- Name: comment_items comment_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_items
    ADD CONSTRAINT comment_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);


--
-- Name: content_posts content_posts_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_posts
    ADD CONSTRAINT content_posts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.platform_accounts(id);


--
-- Name: content_posts content_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_posts
    ADD CONSTRAINT content_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);


--
-- Name: follower_records follower_records_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follower_records
    ADD CONSTRAINT follower_records_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.platform_accounts(id);


--
-- Name: follower_records follower_records_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follower_records
    ADD CONSTRAINT follower_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);


--
-- Name: message_items message_items_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_items
    ADD CONSTRAINT message_items_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.platform_accounts(id);


--
-- Name: message_items message_items_sender_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_items
    ADD CONSTRAINT message_items_sender_account_id_fkey FOREIGN KEY (sender_account_id) REFERENCES public.platform_accounts(id);


--
-- Name: message_items message_items_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_items
    ADD CONSTRAINT message_items_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.message_sessions(id) ON DELETE CASCADE;


--
-- Name: message_items message_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_items
    ADD CONSTRAINT message_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);


--
-- Name: message_sessions message_sessions_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_sessions
    ADD CONSTRAINT message_sessions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.platform_accounts(id);


--
-- Name: message_sessions message_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_sessions
    ADD CONSTRAINT message_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);


--
-- Name: message_templates message_templates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: monitor_hit_records monitor_hit_records_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monitor_hit_records
    ADD CONSTRAINT monitor_hit_records_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.monitor_tasks(id) ON DELETE CASCADE;


--
-- Name: monitor_hit_records monitor_hit_records_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monitor_hit_records
    ADD CONSTRAINT monitor_hit_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: monitor_tasks monitor_tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monitor_tasks
    ADD CONSTRAINT monitor_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: platform_accounts platform_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_accounts
    ADD CONSTRAINT platform_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);


--
-- Name: quick_replies quick_replies_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_replies
    ADD CONSTRAINT quick_replies_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict UWUQRaodCToJvMj47momplN2WC5eB6RlmUmF4K2MkKUhfDfXwe9wpskryMIBe7l

