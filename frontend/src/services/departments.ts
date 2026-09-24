import type { Department } from "../types";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://127.0.0.1:5000/api";

type DepartmentsResponse = {
  departments: Department[];
  message?: string;
};

type DepartmentResponse = {
  department: Department;
  message?: string;
};

const parseJson = async <T>(response: Response): Promise<T> => {
  const data = (await response.json()) as T & { message?: string };

  if (!response.ok) {
    throw new Error(data.message || "Unable to load departments right now.");
  }

  return data;
};

export const fetchDepartments = async () => {
  const response = await fetch(`${API_BASE_URL}/departments`);
  const data = await parseJson<DepartmentsResponse>(response);

  return data.departments;
};

export const fetchDepartment = async (departmentId: string) => {
  const response = await fetch(
    `${API_BASE_URL}/departments/${encodeURIComponent(departmentId)}`,
  );
  const data = await parseJson<DepartmentResponse>(response);

  return data.department;
};
