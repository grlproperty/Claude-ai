import { Wordmark } from '@/components/brand.tsx';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center">
            <Wordmark size="lg" withTagline />
          </div>
          {children}
        </div>
      </main>
      <footer className="px-4 pb-6 text-center text-[0.6875rem] text-ink-faint">
        Private internal system. Access is restricted to authorised Garden Route Lifestyle
        Property staff and all activity is logged.
      </footer>
    </div>
  );
}
