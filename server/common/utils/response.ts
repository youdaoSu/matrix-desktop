export interface ApiSuccessResponse<T> {
  code: number;
  message: string;
  data: T;
}

export function success<T>(data: T, message = 'success'): ApiSuccessResponse<T> {
  return {
    code: 0,
    message,
    data,
  };
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function paginated<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): ApiSuccessResponse<PaginatedData<T>> {
  return success({ items, total, page, pageSize });
}
