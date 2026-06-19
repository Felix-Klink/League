import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "LoL Pool-Gap Finder",
  description:
    "Finde den besten Champ zum Lernen, der die Lücke deiner Mains schließt.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
