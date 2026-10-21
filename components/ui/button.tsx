"use client"

import * as React from "react"

type Variant =
	| "default"
	| "outline"
	| "ghost"
	| "accent"
	| "destructive"

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant
}

const base =
	"inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50"

const variants: Record<Variant, string> = {
	default:
		"bg-white hover:bg-slate-50 text-textpri border border-line shadow-card",
	outline:
		"border border-line bg-transparent hover:bg-slate-100 text-textpri",
	ghost:
		"bg-transparent hover:bg-slate-100 text-textsec",
	accent:
		"bg-accent hover:bg-orange-800 text-white shadow-card",
	destructive:
		"bg-danger hover:brightness-105 text-white",
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className = "", variant = "default", type = "button", ...props }, ref) => {
		return (
			<button
				ref={ref}
				type={type}
				className={`${base} ${variants[variant]} px-4 py-2 ${className}`}
				{...props}
			/>
		)
	}
)
Button.displayName = "Button"

export default Button

