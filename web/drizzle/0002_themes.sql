CREATE TABLE "shared_themes" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"source_id" text NOT NULL,
	"title" text NOT NULL,
	"brief" text DEFAULT '' NOT NULL,
	"concepts" text[] DEFAULT '{}'::text[] NOT NULL,
	"challenges" text[] DEFAULT '{}'::text[] NOT NULL,
	"add_count" integer DEFAULT 0 NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_themes_author_source_unique" UNIQUE("author_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "theme_adds" (
	"theme_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "theme_adds_theme_id_user_id_pk" PRIMARY KEY("theme_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "theme_reports" (
	"theme_id" text NOT NULL,
	"reporter_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "theme_reports_theme_id_reporter_id_pk" PRIMARY KEY("theme_id","reporter_id")
);
--> statement-breakpoint
ALTER TABLE "shared_themes" ADD CONSTRAINT "shared_themes_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_adds" ADD CONSTRAINT "theme_adds_theme_id_shared_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."shared_themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_adds" ADD CONSTRAINT "theme_adds_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_reports" ADD CONSTRAINT "theme_reports_theme_id_shared_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."shared_themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_reports" ADD CONSTRAINT "theme_reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shared_themes_popular_idx" ON "shared_themes" USING btree ("hidden","add_count");--> statement-breakpoint
CREATE INDEX "shared_themes_new_idx" ON "shared_themes" USING btree ("hidden","created_at");--> statement-breakpoint
CREATE INDEX "theme_adds_user_idx" ON "theme_adds" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "theme_reports_reporter_idx" ON "theme_reports" USING btree ("reporter_id");