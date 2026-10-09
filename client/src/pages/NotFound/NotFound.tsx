import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="text-center">
        <div className="text-6xl font-bold text-primary">404</div>
        <h1 className="mt-4 text-2xl font-semibold">页面不存在</h1>
        <p className="mt-2 text-muted-foreground">您访问的页面已移动或不存在。</p>
        <Link className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground" to="/dashboard">
          返回工作台
        </Link>
      </div>
    </main>
  );
};

export default NotFound;
